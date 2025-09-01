Session lifecycle events
After initiating a session via either WebRTC or WebSockets, the server will send a 
session.created
 event indicating the session is ready. On the client, you can update the current session configuration with the 
session.update
 event. Most session properties can be updated at any time, except for the voice the model uses for audio output, after the model has responded with audio once during the session. The maximum duration of a Realtime session is 30 minutes.

The following example shows updating the session with a session.update client event. See the WebRTC or WebSocket guide for more on sending client events over these channels.

Update the system instructions used by the model in this session
const event = {
  type: "session.update",
  session: {
      type: "realtime",
      model: "gpt-realtime",
      // Lock the output to audio (add "text" if you also want text)
      output_modalities: ["audio"],
      audio: {
        input: {
          format: "pcm16",
          turn_detection: { type: "semantic_vad", create_response: true }
        },
        output: {
          format: "g711_ulaw",
          voice: "alloy",
          speed: 1.0
        }
      },
      // Use a server-stored prompt by ID. Optionally pin a version and pass variables.
      prompt: {
        id: "pmpt_123",          // your stored prompt ID
        // version: "89",        // optional: pin a specific version
        variables: {
          city: "Paris"          // example variable used by your prompt
        }
      },
      // You can still set direct session fields; these override prompt fields if they overlap:
      instructions: "Speak clearly and briefly. Confirm understanding before taking actions."
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
When the session has been updated, the server will emit a 
session.updated
 event with the new state of the session.

Related client events:
session.update

Related server events:
session.created
session.updated