Webhooks and server-side controls
=================================

Use webhooks and server-side controls with the Realtime API.

The Realtime API allows clients to connect directly to the API server via WebRTC or SIP. However, you'll most likely want tool use and other business logic to reside on your application server to keep this logic private and client-agnostic.

Keep tool use, business logic, and other details secure on the server side by connecting over a “sideband” control channel. We now have sideband options for both SIP and WebRTC connections.

With WebRTC
-----------

When [establishing a peer connection](/docs/guides/realtime-webrtc), you receive an SDP response from the Realtime API to configure the connection. If you used the sample code from the WebRTC guide, that looks something like this:

```javascript
const baseUrl = "https://api.openai.com/v1/realtime/calls";
const model = "gpt-realtime";
const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
    },
});
```

The SDP response will contain a `Location` header that has a unique call ID that can be used on the server to establish a WebSocket connection to that same Realtime session.

```javascript
const location = sdpResponse.headers.get("Location");
const callId = location?.split("/").pop();
console.log(callId);
// rtc_u1_9c6574da8b8a41a18da9308f4ad974ce
```

On a server, you can then [listen for events and configure the session](/docs/guides/realtime-conversations) just as you would from the client, using the ID from this URL:

```javascript
import WebSocket from "ws";

// You'll need to get the call ID from the browser to your
// server somehow:
const callId = "rtc_u1_9c6574da8b8a41a18da9308f4ad974ce";

// Connect to a WebSocket for the in-progress call
const url = "wss://api.openai.com/v1/realtime?call_id=" + callId;
const ws = new WebSocket(url, {
    headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    },
});

ws.on("open", function open() {
    console.log("Connected to server.");

    // Send client events over the WebSocket once connected
    ws.send(
        JSON.stringify({
            type: "session.update",
            session: {
                type: "realtime",
                instructions: "Be extra nice today!",
            },
        })
    );
});

// Listen for and parse server events
ws.on("message", function incoming(message) {
    console.log(JSON.parse(message.toString()));
});
```

In this way, you are able to add tools, monitor sessions, and carry out business logic on the server instead of needing to configure those actions on the client.

### With SIP

1.  A user connects to OpenAI via phone over SIP.
2.  OpenAI sends a webhook to your application’s backend webhook URL, notifying your app of the state of the session.

```text
POST https://my_website.com/webhook_endpoint
user-agent: OpenAI/1.0 (+https://platform.openai.com/docs/webhooks)
content-type: application/json
webhook-id: wh_685342e6c53c8190a1be43f081506c52 # unique id for idempotency
webhook-timestamp: 1750287078 # timestamp of delivery attempt
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=

{
"object": "event",
"id": "evt_685343a1381c819085d44c354e1b330e",
"type": "realtime.call.incoming",
"created_at": 1750287018, // Unix timestamp
"data": {
"call_id": "some_unique_id",
"sip_headers": [
{ "name": "From", "value": "sip:+142555512112@sip.example.com" },
{ "name": "To", "value": "sip:+18005551212@sip.example.com" },
{ "name": "Call-ID", "value": "03782086-4ce9-44bf-8b0d-4e303d2cc590"}
],
}
}
```

3.  The application server opens a WebSocket connection to the Realtime API using the `call_id` value provided in the webhook. This `call_id` looks like this: `wss://api.openai.com/v1/realtime?call_id={callId}`. The WebSocket connection will live for the life of the SIP call.

Was this page useful?