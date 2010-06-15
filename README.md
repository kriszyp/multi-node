Multi-node provides launching of multiple NodeJS processes for TCP/HTTP serving.
With multi-node it is very simple to add utilize multiple processes to concurrently
serve HTTP requests, simply pass an http.Server object to the listen function:

    var server = require("http").createServer(function(request, response){
            ... standard node request handler ...
        });
    var nodes = require("multi-node").listen({
    		port: 80, 
    		nodes: 4
    	}, server);

The listen function takes two arguments, the first is the options, the second is the 
server.  The options argument may have two properties, "port" (specifying the 
port number to listen on) and "nodes" (specifying the number of node processes).

The object returned from the listen function also provides some useful capabilities. 
The return object has an isMaster property indicating if the current process is the 
original initiating master process. This can be used like:

    var nodes = require("multi-node").listen(...);
    if(nodes.isMaster){
        // start a repl on just one process
        require("repl").start();
    }

Multi-node also provides critical inter-process communication facilities. For any web
application that requires processes to be able to communicate with each other 
(for sending messages like in chat applications, or for doing in-memory sessions, etc.),
it is necessary for each process to be able to communicate with other processes.
The returned object is also an event emitter, and the "node" event is fired for each
other node process that is created. The event handler is a passed a readable and 
writable stream that can be used to communicate with the other process. For example:

    var nodes = require("multi-node").listen(...);
    var allStreams = [];
    nodes.addListener("node", function(stream){
        stream.addListener("data", function(data){
            ... receiving data from this other node process ...
        });
        allStreams.push(stream);
    });
    
    function notifyOtherProcesses(message){
        allStreams.forEach(function(stream){
            stream.write(message);
        });
    }

(Note that at this time, the stream is guaranteed to be immediately writable)

Licensing
--------

Multi-node is part of the Persevere project, and therefore is licensed under the
AFL or BSD license. The Persevere project is administered under the Dojo foundation,
and all contributions require a Dojo CLA.
 