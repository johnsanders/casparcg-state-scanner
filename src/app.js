const osc = require('osc');
const express = require('express');
const graphqlHTTP = require('express-graphql');
const { buildSchema } = require('graphql');
import {CasparCG} from 'casparcg-connection';


//Query schema for GraphQL:
var apiSchema = buildSchema(`
    type Query {
        serverOnline: Boolean
        serverVersion: String
        allChannels: String
        channel(ch: Int!): String
        layer(ch: Int!, l: Int!): String
        timeLeft(ch: Int!, l: Int!): String
    }
`);

//Setup Interface:
var ccgNumberOfChannels = 4;
var ccgNumberOfLayers = 30;
var ccgStatus = {
    serverOnline: false,
    serverVersion: ""
};
var ccgChannel = [];
var obj = {
        "foreground": {
            "name": "",
            "path": "",
            "time": 0,
            "length": 0,
            "loop": false,
            "paused": true
        },
        "background": {
            "name": "",
            "path": "",
            "time": 0,
            "length": 0,
            "loop": false,
            "paused": true
        }
};

// Assign values to ccgChannel
var ch;
var l;
var layers = [];
for (ch=0; ch<ccgNumberOfChannels; ch++) {
    for (l=0; l<ccgNumberOfLayers; l++) {
        layers[l] = JSON.parse(JSON.stringify(obj));
    }
    ccgChannel[ch] = ccgChannel[ch] = JSON.parse(JSON.stringify({ "layer" : layers }));
}

export class App {
    constructor() {
        this.playing = false;
        const _this = this;

        this.setupOscServer();
        this.setupExpressServer();

        //ACMP connection is neccesary, as OSC for now, does not recieve info regarding non-playing files.
        this.setupAcmpConnection();

    }

    setupAcmpConnection() {
        // in current version of casparcg-connection the port has to be assigned as a seperate parameter.
        this.ccgConnection = new CasparCG(
            {
            host: "localhost",
            port: 5250,
            autoConnect: false,
        });
        this.ccgConnection.connect();
        this.ccgConnection.version()
        .then((response) => {
            ccgStatus.serverOnline = true;
            ccgStatus.version = response.response.data;
        });
        var connectionTimer = setInterval(() => this.updateAcmpData(), 300);
    }

    updateAcmpData() {
        var layer = 10;
        for (let channel = 1; channel <= ccgNumberOfChannels; channel++) {
            this.ccgConnection.info(channel,10)
            .then((response) => {
                ccgChannel[channel-1].layer[layer-1].foreground.name = response.response.data.foreground.producer.filename;
                ccgChannel[channel-1].layer[layer-1].background.name = response.response.data.background.producer.filename;
                ccgStatus.serverOnline = true;
            })
            .catch((error) => {
                ccgStatus.serverOnline = false;
                console.log(error);
            });
        }

    }


    timeoutPromise(ms, promise) {
        return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("Offline: Server was to long to respond"));
        }, ms);
        promise.then(resolve, reject);
        });
    }


    setupOscServer() {
        var getIPAddresses = function () {
            var os = require("os"),
                interfaces = os.networkInterfaces(),
                ipAddresses = [];

            for (var deviceName in interfaces) {
                var addresses = interfaces[deviceName];
                for (var i = 0; i < addresses.length; i++) {
                    var addressInfo = addresses[i];
                    if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                        ipAddresses.push(addressInfo.address);
                    }
                }
            }

            return ipAddresses;
        };
        const oscConnection = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: 5253
        });

        oscConnection.on("ready", function () {
            var ipAddresses = getIPAddresses();

            console.log("Listening for OSC over UDP.");
            ipAddresses.forEach(function (address) {
                console.log(" Host:", address + ", Port:", oscConnection.options.localPort);
            });
        });

        oscConnection.on('message', (message) => {
            var channelIndex = this.findChannelNumber(message.address)-1;
            var layerIndex = this.findLayerNumber(message.address)-1;
            if (message.address.includes('/stage/layer')) {
                //Handle foreground messages:
                    if (message.address.includes('/file/path')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.name = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.path = message.args[0];
                    }
                    if (message.address.includes('file/time')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.time = message.args[0];
                        ccgChannel[channelIndex].layer[layerIndex].foreground.length = message.args[1];
                    }
                    if (message.address.includes('loop')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.loop = message.args[0];
                    }
                    if (message.address.includes('/paused')) {
                        ccgChannel[channelIndex].layer[layerIndex].foreground.paused = message.args[0];
                    }
            }
        });

        oscConnection.open();
        console.log(`OSC listening on port 5253`);

    }

    findChannelNumber(string) {
        var channel = string.replace("/channel/", "");
        channel = channel.slice(0, (channel.indexOf("/")));
        return channel;
    }

    findLayerNumber(string) {
        var channel = string.slice(string.indexOf('layer/')+6);
        channel = channel.slice(0, (channel.indexOf("/")));
        return channel;
    }


    setupExpressServer() {
        const server = express();
        const port = 5254;

        // GraphQL Root resolver
        var graphQlRoot = {
            allChannels: () => {
                const ccgString = JSON.stringify(ccgChannel);
                return ccgString;
            },
            channel: (ch) => {
                const ccgChString = JSON.stringify(ccgChannel[ch.ch-1]);
                return ccgChString;
            },
            layer: (args) => {
                const ccgLayerString = JSON.stringify(ccgChannel[args.ch-1].layer[args.l-1]);
                return ccgLayerString;
            },
            timeLeft: (args) => {
                return (ccgChannel[args.ch-1].layer[args.l-1].foreground.length - ccgChannel[args.ch-1].layer[args.l-1].foreground.time);
            },
            serverOnline: () => {
                return ccgStatus.serverOnline;
            }
        };
        server.use('/api', graphqlHTTP({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: false
        }));
        server.use('/test', graphqlHTTP({
            schema: apiSchema,
            rootValue: graphQlRoot,
            graphiql: true
        }));

        server.listen(port, () => console.log(`GraphQl listening on port ${port}/api`));
    }
}
