(() => {
  const socket = io();
  let room = 'default';
  let username = 'Anonymous';
  let localChange = false;
  let seq = 0;

  const editor = document.getElementById('editor');
  const joinBtn = document.getElementById('join-btn');
  const roomInput = document.getElementById('room-input');
  const nameInput = document.getElementById('name-input');
  const presenceEl = document.getElementById('presence');
  const roomNameEl = document.getElementById('room-name');
  const userCountEl = document.getElementById('user-count');
  const statusEl = document.getElementById('status');
  const downloadBtn = document.getElementById('download-btn');

  const debounce = (fn, wait=300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    }
  };

  // Send the whole document (debounced). seq increments to loosely track order.
  const sendEdit = debounce(() => {
    const content = editor.innerText;
    seq++;
    socket.emit('edit', { room, content, seq });
  }, 300);

  editor.addEventListener('input', (e) => {
    localChange = true;
    sendEdit();
    setTimeout(() => localChange = false, 50);
  });

  joinBtn.addEventListener('click', () => {
    const r = roomInput.value.trim() || 'default';
    const n = nameInput.value.trim() || 'Anonymous';
    joinRoom(r, n);
  });

  downloadBtn.addEventListener('click', () => {
    const text = editor.innerText;
    const blob = new Blob([text], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (room || 'document') + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  function joinRoom(r, n) {
    room = r;
    username = n;
    roomNameEl.innerText = room;
    socket.emit('join', { room, username });
    statusEl.innerText = 'Connected as ' + username;
  }

  socket.on('connect', () => {
    statusEl.innerText = 'Connected';
    // auto-join default room on connect
    socket.emit('join', { room, username });
  });

  socket.on('doc', ({ content }) => {
    // initial load
    editor.innerText = content || '';
  });

  socket.on('update', ({ content, from, seq: incomingSeq }) => {
    // ignore updates from ourselves
    if (from === socket.id) return;

    // if user is actively editing (editor focused), skip applying remote update to avoid caret jump
    if (document.activeElement === editor) {
      // In production you'd merge via OT/CRDT. For demo, skip to avoid disrupting typing.
      console.log('Local editing in progress — skipping immediate overwrite from remote');
      return;
    }
    editor.innerText = content;
  });

  socket.on('presence', (clients) => {
    presenceEl.innerHTML = '';
    clients.forEach(c => {
      const li = document.createElement('li');
      li.className = 'presence-item';
      li.textContent = c.username + (c.id === socket.id ? ' (you)' : '');
      presenceEl.appendChild(li);
    });
    userCountEl.innerText = String(clients.length);
  });

  // cursor sending (not rendered in this basic demo)
  editor.addEventListener('mouseup', () => {
    const sel = window.getSelection();
    const cursor = { anchor: sel.anchorOffset, focus: sel.focusOffset };
    socket.emit('cursor', { room, cursor });
  });

  socket.on('cursor', ({ id, username, cursor }) => {
    // placeholder — in a richer client you'd render remote cursors
  });

  // Expose joinRoom in console for quick testing
  window.joinRoom = joinRoom;
})();
