# Google Cloud Platform Speech-to-Text to MQTT

## How to use
1. Create a new [GCP Speech-to-Text project](https://cloud.google.com/speech-to-text/docs/quickstart-client-libraries)
1. Download the private key as a JSON file whith GCP_key.json filename.
1. Start the container whit the following command:
```
docker run -v <your_key>:/app/key/ -p 1337:1337 fsattila/gcptomqtt:latest
```
1. Go to http://localhost:1337/