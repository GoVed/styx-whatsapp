#!/usr/bin/env python3
"""
Syndae Host Tool Daemon: Bi-Directional WhatsApp Reactive Bridge Example
======================================================================
Demonstrates the Syndae Bi-Directional Reactive Tool Architecture:
1. Tool Daemon runs outside the container on the host.
2. Inbound Trigger: When an incoming WhatsApp message arrives, the daemon pushes
   an event to Syndae via `POST /api/tools/trigger`.
3. Syndae queues the turn in its GPU inference scheduler (FIFO concurrency control).
4. The Agent reasons in Docker, checks its markdown skills, searches stickers,
   and calls back to this daemon to send messages and stickers.
5. Mutating tool calls respect Syndae's Human-In-The-Loop (HITL) authorization gate.
"""

import sys
import json
import time
import urllib.request
import urllib.error

SYNDAE_API_URL = "http://localhost:3000"

# Mock sticker catalog
STICKER_DATABASE = [
    {"id": "sad_cat_crying", "tags": ["sad", "cat", "crying", "tears"], "label": "Crying Kitten (Heartbroken)"},
    {"id": "sad_cat_rain", "tags": ["sad", "cat", "rain", "gloomy"], "label": "Cat sitting in the rain"},
    {"id": "cat_thumbs_up", "tags": ["thumbs", "up", "cat", "approval"], "label": "Cat giving thumbs up"},
    {"id": "cat_shrug", "tags": ["cat", "shrug", "idk", "maybe"], "label": "Shrugging Cat"},
    {"id": "celebrate_party", "tags": ["party", "celebrate", "woo"], "label": "Party Popper Cat"},
]

def handle_call_tool(tool_name, args):
    """Executes tools called by the Syndae agent."""
    if tool_name == "whatsapp_find_stickers":
        query = args.get("search", "").lower()
        limit = args.get("limit", 5)
        results = [
            s for s in STICKER_DATABASE
            if any(q in tag or tag in q for tag in s["tags"] for q in query.split())
        ]
        if not results:
            results = STICKER_DATABASE[:limit]
        return {
            "success": True,
            "query": query,
            "stickers": results[:limit]
        }

    elif tool_name == "whatsapp_send_message":
        recipient = args.get("to", "Unknown")
        text = args.get("message", "")
        print(f"\n[HOST WHATSAPP DAEMON] 📱 >> Outbound Message to {recipient}: \"{text}\"")
        return {
            "success": True,
            "to": recipient,
            "status": "DELIVERED",
            "timestamp": time.time()
        }

    elif tool_name == "whatsapp_send_sticker":
        recipient = args.get("to", "Unknown")
        sticker_id = args.get("sticker_id", "")
        print(f"\n[HOST WHATSAPP DAEMON] 🐱 >> Outbound Sticker to {recipient}: [{sticker_id}]")
        return {
            "success": True,
            "to": recipient,
            "sticker_id": sticker_id,
            "status": "DELIVERED",
            "timestamp": time.time()
        }

    else:
        return {"error": f"Unknown tool: {tool_name}"}

def trigger_inbound_message(sender: str, message: str):
    """Pushes a real-time event from the host tool into Syndae to wake the agent."""
    url = f"{SYNDAE_API_URL}/api/tools/trigger"
    payload = {
        "protocol": "whatsapp",
        "event_type": "new_message",
        "source_id": sender,
        "payload": {
            "from": sender,
            "message": message,
            "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"[HOST WHATSAPP DAEMON] Inbound trigger dispatched to Syndae: {json.dumps(data, indent=2)}")
            return data
    except urllib.error.URLError as e:
        print(f"[HOST WHATSAPP DAEMON] Error reaching Syndae: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--trigger":
        sender = sys.argv[2] if len(sys.argv) > 2 else "Friend Bob"
        msg = sys.argv[3] if len(sys.argv) > 3 else "hey wanna go out to costco at 6?"
        print(f"Triggering inbound WhatsApp message from '{sender}': \"{msg}\"")
        trigger_inbound_message(sender, msg)
    else:
        print("Usage:")
        print("  python3 examples/whatsapp_host_daemon.py --trigger \"Friend Bob\" \"hey wanna go out to costco at 6?\"")
