Working with audio output from a WebSocket
To play output audio back on a client device like a web browser, we recommend using WebRTC rather than WebSockets. WebRTC will be more robust sending media to client devices over uncertain network conditions.

But to work with audio output in server-to-server applications using a WebSocket, you will need to listen for 
response.audio.delta
 events containing the Base64-encoded chunks of audio data from the model. You will either need to buffer these chunks and write them out to a file, or maybe immediately stream them to another source like a phone call with Twilio.

Note that the 
response.audio.done
 and 
response.done
 events won't actually contain audio data in them - just audio content transcriptions. To get the actual bytes, you'll need to listen for the 
response.audio.delta
 events.

The format of the output chunks can be configured either for the entire session, or per response.

Session: session.output_audio_format in 
session.update
Response: response.output_audio_format in 
response.create
Listen for response.audio.delta events
function handleEvent(e) {
  const serverEvent = JSON.parse(e.data);
  if (serverEvent.type === "response.audio.delta") {
    // Access Base64-encoded audio chunks
    // console.log(serverEvent.delta);
  }
}

// Listen for server messages (WebSocket)
ws.on("message", handleEvent);
