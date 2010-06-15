var net = require("net"),
	childProcess = require("child_process"),
	lastStdout,
	netBinding = process.binding("net");

exports.ignoreReloadMessages = true;
exports.listen = function(options, server){
	var isMaster;
	if(process.env._IS_CHILD_){
	    var stdin = new net.Stream(0, 'unix');
	    var descriptorType;
	    stdin.addListener('data', function(message){
	        descriptorType = message;
	    });
	    var siblingIn;
	    stdin.addListener('fd', function(fd){
	    	if(descriptorType == "tcp"){
	    		server.listenFD(fd, 'tcp4');
	    	}
/*	    	else if(descriptorType == "sibling-start"){
	    		var stream = new net.Stream(fd, "unix");
	    		stream.resume();
	    		stream.write("handshake");
    			siblingCallbacks.forEach(function(callback){
    				callback(stream);
    			});
	    	}*/
	    	else if(descriptorType == "sibling"){
	    		var stream = new net.Stream(fd, "unix");
	    		emitter.emit("node", stream);
	    		stream.resume();
	    	}
	    	else{
    			throw new Error("Unknown file descriptor " + descriptorType);
	    	}
	    });
	    stdin.resume();		
	}else{
		isMaster = true;
		var children = [],
			tcpDescriptor = netBinding.socket("tcp4");
		netBinding.bind(tcpDescriptor, options.port || 80);
		netBinding.listen(tcpDescriptor, 128);
		server.listenFD(tcpDescriptor, 'tcp4');
		var priorArgs = process.argv;
		if(process.platform == "cygwin" && priorArgs){
			priorArgs = ["/usr/bin/bash","--login","-c", "cd " + process.cwd() + " && " + priorArgs.join(" ")];
		}
		var env = {_IS_CHILD_: "true"};
		for(var i in process.env){
			env[i] = process.env[i];
		}
		for(var i = 0; i < options.nodes - 1; i++){
			var childConnection = netBinding.socketpair();
			// spawn the child process
			var child = children[i] = childProcess.spawn(
				priorArgs[0],
				priorArgs.slice(1),
				env,
				[childConnection[1], -1, -1]	
			);
			child.master = new net.Stream(childConnection[0], 'unix');
			
			child.master.write("tcp", "ascii", tcpDescriptor);
			(function(child){
				for(var j = 0; j < i; j++){
						var siblingConnection = netBinding.socketpair();
						/*var a = new net.Stream(siblingConnection[1], 'unix');
						a.addListener('data', function(data){
							a.pause();
							child.master.write("sibling", "ascii", siblingConnection[1]);
						});
						a.resume();*/
						child.master.write("sibling", "ascii", siblingConnection[1]);
						children[j].master.write("sibling", "ascii", siblingConnection[0]);
				}
				var masterChildConnection = netBinding.socketpair();
				process.nextTick(function(){
		    		var stream = new net.Stream(masterChildConnection[0], "unix");
		    		emitter.emit("node", stream);
		    		stream.resume();
					child.master.write("sibling", "ascii", masterChildConnection[1]);
				});
			})(child);
			
			// Redirect stdout and stderr
			child.stdout.addListener('data', function(data){
				if(exports.ignoreReloadMessages && data.toString().substring(0, 10) == "Reloading "){ 
					return;
				}
				process.stdout.write("\r" + data + "\r");
			});  
			child.stderr.addListener('data', function(data){
				require("sys").puts("\r" + data + "\r");  
			});
		}
 
	}
	var emitter = new process.EventEmitter();
	emitter.isMaster = isMaster;
	return emitter;
}

function startWorker() {

}