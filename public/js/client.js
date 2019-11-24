'use strict'

const socket = io.connect();

// Stream Audio
let bufferSize = 2048,
	AudioContext,
	context,
	processor,
	input,
	globalStream;

// HTML elemnets
let audioElement = document.querySelector('audio'),
	resultText = document.getElementById('ResultText');

// audioStream constraints
const constraints = {
	audio: true,
	video: false
};

// RECORDING
function initRecording() {
	socket.emit('startGoogleCloudStream', document.getElementById("languageCode").value);
	AudioContext = window.AudioContext || window.webkitAudioContext;
	context = new AudioContext({
		latencyHint: 'interactive',
	});
	processor = context.createScriptProcessor(bufferSize, 1, 1);
	processor.connect(context.destination);
	context.resume();

	var handleSuccess = function (stream) {
		globalStream = stream;
		input = context.createMediaStreamSource(stream);
		input.connect(processor);

		processor.onaudioprocess = function (e) {
			microphoneProcess(e);
		};
	};

	navigator.mediaDevices.getUserMedia(constraints)
		.then(handleSuccess);

}

function microphoneProcess(e) {
	var left = e.inputBuffer.getChannelData(0);
	var left16 = downsampleBuffer(left, 44100, 16000)
	socket.emit('binaryData', left16);
}

// INTERFACE
var startButton = document.getElementById("startRecButton");
startButton.addEventListener("click", startRecording);

var endButton = document.getElementById("stopRecButton");
endButton.addEventListener("click", stopRecording);
endButton.disabled = true;

var connect = document.getElementById("connectmqttButton");
connect.addEventListener("click", connectmqtt);

var disconnect = document.getElementById("disconnectmqttButton");
disconnect.addEventListener("click", disconnectmqtt);

function connectmqtt() {
	let data = [document.getElementById("mqtt_broker_ip").value, document.getElementById("mqtt_topic").value, "Connected"];
	document.getElementById("mqtt_current_ip").innerHTML = data[0];
	document.getElementById("mqtt_current_topic").innerHTML = data[1];
	document.getElementById("mqtt_current_status").innerHTML = data[2];
	socket.emit('connectmqtt_event', data)
}

function disconnectmqtt() {
	let data = ['Disconnected'];
	document.getElementById("mqtt_current_status").innerHTML = data[0];
	document.getElementById("mqtt_current_ip").innerHTML = "";
	document.getElementById("mqtt_current_topic").innerHTML = "";
	socket.emit('disconnectmqtt_event', data)
}

function startRecording() {
	endButton.disabled = false;
	initRecording();
}

function stopRecording() {
	endButton.disabled = true;
	socket.emit('endGoogleCloudStream', resultText.innerHTML);
	let track = globalStream.getTracks()[0];
	track.stop();
	input.disconnect(processor);
	processor.disconnect(context.destination);
	context.close().then(function () {
		input = null;
		processor = null;
		context = null;
		AudioContext = null;
		startButton.disabled = false;
	});
}

// SOCKET.IO
socket.on('connect', function (data) {
	socket.emit('join', 'Server Connected to Client');
});

socket.on('messages', function (data) {
	console.log(data);
});

socket.on('speechData', function (data) {
	var dataFinal = undefined || data.results[0].isFinal;

	if (dataFinal === false) {
		let interimString = data.results[0].alternatives[0].transcript;
		console.log(interimString);
		resultText.innerHTML = interimString;

	} else if (dataFinal === true) {
		//log final string
		let finalString = data.results[0].alternatives[0].transcript;
		console.log("Google Speech sent 'final' Sentence and it is:");
		console.log(finalString);
		resultText.innerHTML = finalString;
	}
});

var downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
    if (outSampleRate == sampleRate) {
        return buffer;
    }
    if (outSampleRate > sampleRate) {
        throw "downsampling rate show be smaller than original sample rate";
    }
    var sampleRateRatio = sampleRate / outSampleRate;
    var newLength = Math.round(buffer.length / sampleRateRatio);
    var result = new Int16Array(newLength);
    var offsetResult = 0;
    var offsetBuffer = 0;
    while (offsetResult < result.length) {
        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        var accum = 0, count = 0;
        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = Math.min(1, accum / count)*0x7FFF;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result.buffer;
}