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
server.  The options argument may have the following properties:

* port - specifying the port number to listen on (defaults to 80)
* nodes - specifying the number of node processes (defaults to 1)
* host - address to listen on (defaults to 0.0.0.0)
* masterListen - Indicate whether the master process should listen and handle 
requests as well (on by default, but you may want to turn this off if you processes are 
prone to dying and you want to reliably utilize auto-restart of processes), defaults to true
* restartChildren - Automatically restart child process when they die (defaults to true)

The object returned from the listen function also provides some useful capabilities. 
The return object has an "isMaster" property indicating if the current process is the 
original initiating master process. This can be used like:

    var nodes = require("multi-node").listen(...);
    if(nodes.isMaster){
        // start a repl on just one process
        require("repl").start();
    }

The returned object also provides an "id" property with an id for the current 
process (each node/process has a unique id).

Inter-process Communication
=======================

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

Framing
--------

The stream object returned from the "node" event for cross-process communication
can be a bit unwieldy to work with by itself, since the stream events can break data
up in non-deterministic fashion, and works at the binary level. You can use 
multi-node's framing mechanism to simplify this. Use the frameStream() function to
transform a raw stream into a framed stream that follows the WebSocket API. With
this API you can send strings, objects, and other values with the send(value) function
and receive these values by listening for the "message" event:

    nodes.addListener("node", function(stream){
        stream = require("multi-node").frameStream(stream);
        stream.addListener("message", function(data){
            ... receiving string, object, or other value from the other node process ...
        });
        stream.send({foo:"bar"});
    });


Notes
----

Node doesn't support fd passing windows yet, so mult-process delegation doesn't work on windows. 

Licensing
--------

Multi-node is part of the Persevere project, and therefore is licensed under the
AFL or BSD license. The Persevere project is administered under the Dojo foundation,
and all contributions require a Dojo CLA.
 
