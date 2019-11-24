'use strict'

const express = require('express');
const fs = require('fs');
const environmentVars = require('dotenv').config();
const mqtt = require('mqtt');

// LOGGING
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// GCP
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();

const encoding = 'LINEAR16';
const sampleRateHertz = 16000;


const app = express();
const port = process.env.PORT || 1337;
const server = require('http').createServer(app);

let mqtt_ip, mqtt_topic, mqtt_status = "Disconnected";
var mqtt_client;

const io = require('socket.io')(server);

app.use('/assets', express.static(__dirname + '/public'));
app.use('/session/assets', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded());


// ROUTERS
app.get('/', function (req, res) {
    res.render('index', {});
});

app.use('/', function (req, res, next) {
    next();
});

function disconnectmqtt(data) {
    if (mqtt_status === "Connected") {
        mqtt_client.end()
        mqtt_status = data[0]
        logger.info(`Unsubscribed from ${mqtt_ip} broker, ${mqtt_topic} topic.`)
    }
}

// SOCKET.IO
io.on('connection', function (client) {
    logger.info('Client Connected to server');
    let recognizeStream = null;

    client.on('join', function (data) {
        client.emit('messages', 'Socket Connected to Server');
    });

    client.on('messages', function (data) {
        client.emit('broad', data);
    });

    client.on('startGoogleCloudStream', function (data) {
        startRecognitionStream(this, data);
    });

    client.on('endGoogleCloudStream', function (data) {
        stopRecognitionStream();
        if (mqtt_status === "Connected") {
            publishmqtt(data);
        }
    });

    client.on('binaryData', function (data) {
        if (recognizeStream !== null) {
            recognizeStream.write(data);
        }
    });
    function publishmqtt(data){
        mqtt_client.publish(mqtt_topic, data)
        logger.info("Teszt count")
        //For testing read the publishd message
        //mqtt://test.mosquitto.org
        //presence
        mqtt_client.on('message', function (topic, message) {
            logger.info(`FROM MQTT: ${message.toString()}`)
        })
    }

    function startRecognitionStream(client, data) { 
        const request = {
            config: {
                encoding: encoding,
                sampleRateHertz: sampleRateHertz,
                languageCode: data,
                profanityFilter: false,
                enableWordTimeOffsets: true,
            },
            single_utterance: true,
            interimResults: true
        };
        recognizeStream = speechClient.streamingRecognize(request)
            .on('error', console.error)
            .on('data', (data) => {
                logger.debug(
                    (data.results[0] && data.results[0].alternatives[0])
                        ? `${data.results[0].alternatives[0].transcript}\n`
                        : `\n\nReached transcription time limit, press Ctrl+C\n`);
                client.emit('speechData', data);
            });
    }

    function stopRecognitionStream() {
        if (recognizeStream) {
            recognizeStream.end();
        }
        recognizeStream = null;
    }
    client.on('connectmqtt_event', function (data) {
        mqtt_ip = data[0] ;
        mqtt_topic = data[1];
        mqtt_status = data[2];
        mqtt_client  = mqtt.connect(mqtt_ip) 
        mqtt_client.on('connect', function () {
            mqtt_client.subscribe(mqtt_topic, function (err) {
                if (!err) {
                    logger.info(`Subscribed to ${mqtt_ip} broker, ${mqtt_topic} topic.`)
                    mqtt_status = "Connected"
                }
                else{
                    logger.error(err.message)
                }
            })
        })
    });
    
    client.on('disconnectmqtt_event', function (data) {
        disconnectmqtt(data)
    });
});

// START SERVER
server.listen(port, "0.0.0.0", function () {
    logger.info('Server started on port:' + port)
});

process.on('SIGINT', function onSigint () {
    logger.info('Got SIGINT (aka ctrl-c in docker). Graceful shutdown.');
    disconnectmqtt(['Disconnected']);
    process.exit();
});

// quit properly on docker stop
process.on('SIGTERM', function onSigterm () {
    logger.info('Got SIGTERM (docker container stop). Graceful shutdown.');
    disconnectmqtt(['Disconnected']);
    process.exit();
})