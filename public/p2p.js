"use strict";

var peer = new Peer({ key: "2nnnwv66dinhr529" });

const state = {
  connections: {},
  queue: [],
  blobs: {},
  initialized: false,
  waiting: false // if we are currently waiting for confirmations to play next thing in queue
};
console.log("state:", state);

peer.on("open", peerId => {
  document.getElementById("id-here").innerHTML = peerId;

  state.id = peerId;
});

const messageHandler = {
  init(message) {
    // in case user tries to manually connect to everyone
    if (!state.initialized) {
      // try to connect to all existing connections
      message.content.connections
        .filter(peerId => peerId !== state.id)
        .forEach(peerId => connectToPeer(peerId));
      state.initialized = true;
    }
  },
  queueSkip(message) {
    // when someone decides to skip the current
    const skipped = state.queue.pop();
    if (skipped !== undefined) {
      addChatMessage(message.origin + " skipped " + skipped.name);

      if (next.content.confirmed !== Object.keys(state.connections).length - 1) {
        addChatMessage("Waiting for people to accept...");
        state.waiting = true;
      } else {
        if (state.queue[index].content.type === "audio") {
          useAudio(state.queue[index]);
        } else {
          useVideo(state.queue[index]);
        }
      }
    } else {
      addChatMessage("No media to skip");
    }
  },
  queueNext(message) {
    // when current media is over
    const next = state.queue.pop();

    if (next !== undefined) {
      addChatMessage("No media left to play");
      return;
    }
    if (next.content.confirmed !== Object.keys(state.connections).length - 1) {
      addChatMessage("Waiting for people to accept...");
      state.waiting = true;
    } else {
      if (state.queue[index].content.type === "audio") {
        useAudio(state.queue[index]);
      } else {
        useVideo(state.queue[index]);
      }
    }
  },
  queueAdd(message) {
    state.queue.push(message.content);
    addChatMessage(
      message.origin +
        " added " +
        message.content.name +
        " to the queue. You may accept this if you have the file."
    );
    if (message.content.type === "file") {
      // TODO: document.getElementById("file-response-modal").classList.add("show");
    }
    addQueueRow(message.content);
  },
  queueRemove(message) {
    const index = state.queue.findIndex(elem => elem.name === message.content);

    if (state.queue[index]) {
      addChatMessage(message.content + " removed " + state.queue[index].name + " from the queue");
      state.queue.splice(index, 1);
    }
  },
  queueAccept(message) {
    addChatMessage(message.origin + " accepted adding " + message.content.name + " to the queue");

    const index = state.queue.findIndex(elem => elem.name === message.content.name);
    if (state.queue[index]) {
      state.queue[index].confirmed += 1;

      if (state.queue[index].confirmed === Object.keys(state.connections).length) {
        state.waiting = false;

        if (state.queue[index].content.type === "audio") {
          useAudio(state.queue[index]);
        } else {
          useVideo(state.queue[index]);
        }
      }
    }
  },
  queueStartTransfer(message) {
    addChatMessage(
      message.origin + " is transferring " + message.content.name + " to " + message.content.target
    );
  },
  queueEndTransfer(message) {
    addChatMessage(
      message.origin +
        " finished transferring " +
        message.content.name +
        " to " +
        message.content.target
    );
  },
  queueRequest(message) {
    const index = state.queue.findIndex(elem => elem.name === message.content.name);

    if (state.queue[index]) {
      console.log("sending");
      conn.send(message.origin, {
        type: "queueRequestFulfill",
        origin: peer.id,
        content: {
          data: new Blob([state.queue[index].content.file], { type: state.queue[index].content.filetype }),
          type: state.queue[index].content.filetype
        }
      });
      console.log("sent file?");
    }
  },
  queueRequestFulfill(message) {
    //new Blob([message.content.data], { type: message.content.type });
  },
  queueReject(message) {
    addChatMessage(message.origin + " rejected adding " + message.content.name + " to the queue");

    const index = state.queue.findIndex(elem => elem.name === message.content.name);
    if (state.queue[index]) {
      state.queue.splice(index, 1);

      if (index === 0) {
        state.waiting = false;
      } else {
        addChatMessage("Moving on");
        messageAllPeers("queueNext");
      }
    }
  },
  chatMessage(message) {
    addChatMessage(message.origin + ": " + message.content);
  },
  play(message) {
    addChatMessage(message.origin + " resumed");
    state.currentMedia.currentTime = message.content.currentTime;
    state.currentMedia.play();
  },
  pause(message) {
    addChatMessage(message.origin + " paused");
    state.currentMedia.currentTime = message.content.currentTime;
    state.currentMedia.pause();
  },
  seek(message) {
    addChatMessage(message.origin + " changed the time to " + message.content.time);
    state.currentMedia.currentTime = message.content.time;
  }
};

peer.on("connection", conn => {
  console.log("got connection: from " + conn.peer, conn);

  // connect back if needed
  const alreadyConnected = connectToPeer(conn.peer, true);

  // initialize new friends
  if (!alreadyConnected) {
    // TODO: setting metadata for whether someone is initialized
    setTimeout(() => {
      console.log("delayed send... not sure why but this is necessary");
      state.connections[conn.peer].send({
        type: "init",
        origin: state.id,
        content: {
          connections: Object.keys(state.connections)
        }
      });

      // TODO: send queue and send waiting
    }, 500);
  }

  // Receive messages
  conn.on("data", message => {
    if (typeof message.type !== "string" || typeof message.origin !== "string") {
      console.error("Invalid message", message);
      return;
    }

    console.log("Received validly structured message: ", message);

    if (messageHandler[message.type]) {
      messageHandler[message.type](message);
      return;
    }

    console.error("Unknown message type " + message.type, message);
  });

  conn.on("close", () => {
    addChatMessage(conn.peer + " disconnected");

    delete state.connections[conn.peer];
  });

  conn.on("error", err => console.error(err));
});

peer.on("error", error => console.error(error));

// DOM interface
function connect() {
  const peerId = document.getElementById("peerId").value;

  connectToPeer(peerId);
  document.getElementById("peerId").value = "";
}

// DOM interface
function sendChatMessage() {
  const { value } = document.getElementById("message");
  messageAllPeers("chatMessage", value);
  messageHandler.chatMessage({ origin: "you", content: value });
  document.getElementById("message").value = "";
}

function addQueue(file, fileType) {
  const content = {
    id: Date.now(),
    name: file.name.split(".")[0],
    type: "file",
    content: {
      type: fileType,
      file: file,
      filetype: file.name.split(".")[-1],
      confirmed: 0
    }
  };
  messageAllPeers("queueAdd", content);
  messageHandler.queueAdd({ origin: "you", content });
}

function removeQueue() {
  const content = {
    name: "hardcode"
  };
  messageAllPeers("queueRemove", content);
  messageHandler.queueRemove({ origin: "you", content });
}

function skip() {
  messageAllPeers("skip");
  messageHandler.skip();
}

function play() {
  const content = {
    currentTime: state.currentMedia.currentTime
  };
  messageAllPeers("play", content);
  addChatMessage("you played");
}

function pause() {
  const content = {
    currentTime: state.currentMedia.currentTime
  };
  messageAllPeers("pause", content);
  addChatMessage("you paused");
}

function ended() {
  messageAllPeers("queueNext");
  messageHandler.queueNext();
}

function seek() {
  const content = {
    time: state.currentMedia.currentTime
  };
  messageAllPeers("seek", content);
  addChatMessage("you changed the time to " + content.time);
}

const messageAllPeers = (type, content) => {
  Object.values(state.connections).forEach(c => c.send({ type, origin: state.id, content }));
};

// Returns whether peer already existed
const connectToPeer = (peerId, hitback) => {
  if (state.connections[peerId] === undefined) {
    const conn = peer.connect(peerId);

    if (hitback) {
      addAdminChat(conn.peer + " connected");
    } else {
      addAdminChat("Connected to " + peerId);
    }
    addConnection(peerId);

    state.connections[peerId] = conn;

    return false;
  }
  return true;
};

document.addEventListener(
  "DOMContentLoaded",
  () => {
    document.getElementById("video-input").addEventListener("change", function(event) {
      // make sure a file was actually selected
      if (this.files[0]) {
        addQueue(this.files[0], "video");
      }
    });
    document.getElementById("audio-input").addEventListener("change", function(event) {
      // make sure a file was actually selected
      if (this.files[0]) {
        addQueue(this.files[0], "audio");
      }
    });
  },
  false
);

// Replace media player with video
const useVideo = media => {
  const mediaBox = document.getElementById("media");
  mediaBox.innerHTML = "";

  const video = document.createElement("video");
  video.id = "v";
  video.controls = true;
  video.addEventListener("play", play);
  video.addEventListener("pause", pause);
  video.addEventListener("seeked", seek);
  video.addEventListener("ended", ended);

  video.src = URL.createObjectURL(media.file);

  mediaBox.appendChild(video);

  state.currentMedia = video;

  document.getElementById("video-input").hidden = true;
  document.getElementById("video-button").hidden = false;
};

// Replace media player with audio
const useAudio = media => {
  const mediaBox = document.getElementById("media");
  mediaBox.innerHTML = "";

  const audio = document.createElement("audio");
  audio.id = "a";
  audio.controls = true;
  audio.addEventListener("play", play);
  audio.addEventListener("pause", pause);
  audio.addEventListener("seeked", seek);
  audio.addEventListener("ended", ended);

  audio.src = URL.createObjectURL(media.file);

  mediaBox.appendChild(audio);

  state.currentMedia = audio;

  document.getElementById("audio-input").hidden = true;
  document.getElementById("audio-button").hidden = false;
};

// add msg to chat box
const addChatMessage = msg => {
  append("chat", msg);
  const objDiv = document.getElementById("chat");
  objDiv.scrollTop = objDiv.scrollHeight;
};

// add system message to chat box
const addAdminChat = msg => {
  append("chat", msg, "p", true);
  var objDiv = document.getElementById("chat");
  objDiv.scrollTop = objDiv.scrollHeight;
};

const addQueueRow = content => {
  const row = document.createElement("tr");
  row.id = content.id;

  const removeButtonCell = document.createElement("td");
  removeButtonCell.width = "35px";
  const removeButton = document.createElement("input");
  removeButton.type = "button";
  removeButton.className = "btn btn-info";
  removeButton.value = "Remove";
  removeButton.onclick = function(event) {
    const row = event.target.parentNode.parentNode;
    const table = row.parentNode;

    table.removeChild(row);
  };

  removeButtonCell.appendChild(removeButton);

  const nameCell = document.createElement("td");
  nameCell.innerHTML = content.name;

  row.appendChild(nameCell);
  row.appendChild(removeButtonCell);

  document.getElementById("queue").appendChild(row);
};

// add peer name to connections list
const addConnection = name => append("connections-here", name);

const append = (id, msg, elem = "p", admin = false) => {
  const element = document.createElement(elem);
  element.textContent = msg;
  if (admin) {
    element.setAttribute("style", "color:#0033cc");
  }
  document.getElementById(id).appendChild(element);
};

const remove = elem => {
  var elem = document.getElementById(id);
  return elem.parentNode.parentNode.removeChild(elem);
};

function showAudioBrowser() {
  document.getElementById("audio-input").hidden = false;
  document.getElementById("audio-button").hidden = true;

  document.getElementById("video-input").hidden = true;
  document.getElementById("video-button").hidden = false;
}

function showVideoBrowser() {
  document.getElementById("video-input").hidden = false;
  document.getElementById("video-button").hidden = true;

  document.getElementById("audio-input").hidden = true;
  document.getElementById("audio-button").hidden = false;
}
