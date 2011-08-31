var net = require("net"),
	childProcess = require("child_process"),
	Buffer = require("buffer").Buffer,
	lastStdout,
	netBinding = process.binding("net");

exports.ignoreReloadMessages = true;
exports.listen = function(options, server){
	var isMaster;
	var emitter = new process.EventEmitter();
	if(process.env._CHILD_ID_){
		emitter.id = process.env._CHILD_ID_; 
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
		emitter.id = "master";
		var children = [],
			tcpDescriptor = netBinding.socket("tcp4");
		netBinding.bind(tcpDescriptor, options.port || 80, options.host || '0.0.0.0');
		netBinding.listen(tcpDescriptor, 128);
		var masterListen = options.masterListen !== false;
		var numChildren = (options.nodes || 1) - (masterListen ? 1 : 0);
		if(masterListen){
			server.listenFD(tcpDescriptor, 'tcp4');
		}
		var priorArgs = process.argv;
		if(process.platform == "cygwin" && priorArgs){
			priorArgs = ["/usr/bin/bash","--login","-c", "cd " + process.cwd() + " && " + priorArgs.join(" ")];
		}
		var env = {};
		for(var i in process.env){
			env[i] = process.env[i];
		}
		var createChild = function(i){
			var childConnection = netBinding.socketpair();
			var siblingConnection = netBinding.socketpair();
			var masterChildConnection = netBinding.socketpair();
			env._CHILD_ID_ = "child-" + i;
			// spawn the child process
			var child = children[i] = childProcess.spawn(
				priorArgs[0],
				priorArgs.slice(1),
				env,
				[childConnection[1], 1, 2]
			);
			child.master = new net.Stream(childConnection[0], 'unix');
			
			child.master.write("tcp", "ascii", tcpDescriptor);
			(function(child){
				for(var j = 0; j < i; j++){
						child.master.write("sibling", "ascii", siblingConnection[1]);
						children[j].master.write("sibling", "ascii", siblingConnection[0]);
				}
				process.nextTick(function(){
					var stream = new net.Stream(masterChildConnection[0], "unix");
					emitter.emit("node", stream);
					stream.resume();
					child.master.write("sibling", "ascii", masterChildConnection[1]);
				});
			})(child);
			child.addListener("exit", function(){
				// cleanup connections
				[].concat(childConnection, siblingConnection, masterChildConnection).forEach(netBinding.close);
				// remove the dead one
				children[i] = null;
				// make a new process to replace the dead one
				if(options.restartChildren !== false){
					createChild(i);
				}
			});
		}
		for(var i = 0; i < numChildren; i++){
			createChild(i);
		}
		["SIGINT", "SIGTERM", "SIGKILL", "SIGQUIT", "SIGHUP", "exit"].forEach(function(signal){
			process.addListener(signal, function(){
				children.forEach(function(child){
					try{
						child.kill();
					}catch(e){
						
					}
				});
				// we use SIGHUP to restart the children
				if(signal !== 'exit' && signal !== 'SIGHUP'){
					process.exit();
				}
			});
		});
		
	}
	emitter.isMaster = isMaster;
	return emitter;
}

// pass in a raw unframed binary stream, and returns a framed stream for sending and
// receving strings or other JSON data
exports.frameStream = function(stream){
	var parse = JSON.parse;
	var emitter = new process.EventEmitter();
	var buffered = [];
	var start;
	stream.addListener("data", function(data){
		start = 0;
		for(var i = 0, l = data.length; i < l; i++){
			var b = data[i];
			if(b === 0){
				start = i + 1;
			}
			if(b === 255){
				var buffer = data.slice(start, i);
				if(buffered.length){
					buffered.push(buffer);
					var totalSize = 0;
					buffered.forEach(function(part){
						totalSize += part.length;
					});
					var buffer = new Buffer(totalSize);
					var index = 0;
					buffered.forEach(function(part){
						part.copy(buffer, index, 0, part.length);
						index += part.length;
					});
				}
				emitter.emit("message", parse(buffer.toString("utf8", 0, buffer.length)));
				start = i + 1;
				buffered = [];
			}
		}
		if(start < l){
			buffered.push(data.slice(start, data.length));
		}
	});
	emitter.send = function(message){
		var buffer = new Buffer(JSON.stringify(message), "utf8");
		var framedBuffer = new Buffer(buffer.length + 2);
		framedBuffer[0] = 0;
		buffer.copy(framedBuffer, 1, 0, buffer.length);
		framedBuffer[framedBuffer.length - 1] = 255;
		stream.write(framedBuffer); 
	};
	emitter.on = emitter.addListener;
	return emitter;
};

exports.frameStreamLengthEncoded = function(stream){
	var emitter = new process.EventEmitter();
	var buffer, bufferIndex;
	var remainingFrameSize = 0;
	stream.addListener("data", function(data){
		while(data.length){
			if(buffer && (buffer.length - bufferIndex > data.length)){
				data.copy(buffer, bufferIndex, 0, data.length);
				bufferIndex += data.length;
			}else{
				if(buffer){
					data.copy(buffer, bufferIndex, 0, buffer.length - bufferIndex);
					emitter.emit("message", buffer.toString("utf8", 0, buffer.length));
					data = data.slice(buffer.length - bufferIndex, data.length);
				}
				if(data.length){
					buffer = new Buffer((data[index] << 24) + (data[index + 1] << 16)  + (data[index + 2] << 8) + (data[index + 3]));
					bufferIndex = 0;
					data = data.slice(4, data.length);
				}else{
					buffer = null;
				}
			}
		}
	});
	emitter.send = function(message){
		var buffer = new Buffer(message, "utf8");
		stream.write(new Buffer([buffer.length >> 24, buffer.length >> 16 & 255, buffer.length >> 8 & 255, buffer.length & 255])); 
	};
	return emitter;
};
