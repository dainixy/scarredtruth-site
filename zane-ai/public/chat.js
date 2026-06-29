// chat.js — the talking. Streams Zane's reply from /api/chat (SSE over fetch).
// No framework. Keeps a short history so he has context across turns.
(function () {
  "use strict";

  var thread = document.getElementById("thread");
  var form = document.getElementById("composer");
  var input = document.getElementById("input");
  var send = document.getElementById("send");
  var modeTag = document.getElementById("mode");
  var status = document.getElementById("status"); // sr-only live region

  var INTRO =
    "I'm not going to ask how I can help you. I'm going to ask what you're carrying. " +
    "You don't have to know how to say it — one line is enough. Start wherever it hurts.";
  var history = [{ role: "assistant", content: INTRO }];
  var busy = false;
  var WATCHDOG_MS = 25000;
  var resultId = null;

  // She can paste her quiz result link here; Zane then has her full result as context.
  function extractResultId(text) {
    var m = String(text || "").match(/\/r\/([A-Za-z0-9_-]{6,16})/) || String(text || "").match(/[?&]r=([A-Za-z0-9_-]{6,16})/);
    return m ? m[1] : null;
  }
  function addZaneLine(text) {
    var m = el("div", "msg zane"); var p = el("p"); p.textContent = text; m.appendChild(p);
    thread.appendChild(m); scrollDown(true); history.push({ role: "assistant", content: text });
  }
  function loadResultContext(id, announce) {
    resultId = id;
    fetch("/api/result/" + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (rec) {
      if (rec && announce) {
        var name = rec.person && rec.person.name ? (", " + rec.person.name) : "";
        addZaneLine("Got it" + name + " — I can see your result now. " + (rec.primaryName ? ("It came out " + rec.primaryName + ". ") : "") + "Tell me what part of it felt most true.");
      }
    }).catch(function () {});
  }
  // if this page was opened with ?r=<id> or /r/<id>, pick it up
  (function () { var id = extractResultId(location.search) || extractResultId(location.pathname); if (id) loadResultContext(id, true); })();

  fetch("/api/health")
    .then(function (r) { return r.json(); })
    .then(function (h) { if (h && h.mode === "mock") { modeTag.textContent = "preview"; modeTag.hidden = false; } })
    .catch(function () {});

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  // only auto-scroll if she's already near the bottom (don't hijack re-reading)
  function scrollDown(force) {
    var nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    if (force || nearBottom) thread.scrollTop = thread.scrollHeight;
  }

  function say(msg) { if (status) status.textContent = msg; }

  function addHer(text) {
    var m = el("div", "msg her");
    m.textContent = text;
    thread.appendChild(m);
    scrollDown(true);
  }

  // streaming bubble: aria-hidden while it grows (so SR doesn't re-announce every token)
  function addStreamingBubble() {
    var wrap = el("div", "msg zane");
    wrap.setAttribute("aria-hidden", "true");
    var t = el("span", "typing");
    t.setAttribute("role", "status");
    t.setAttribute("aria-label", "Zane is typing");
    t.innerHTML = "<span></span><span></span><span></span>";
    wrap.appendChild(t);
    thread.appendChild(wrap);
    scrollDown(true);
    return wrap;
  }

  function setBusy(state) {
    busy = state;
    send.disabled = state;
    // readOnly (not disabled) keeps the textarea focusable so focus isn't dumped to <body>
    input.readOnly = state;
  }

  function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var text = input.value.trim();
    if (!text) return;

    var foundId = extractResultId(text);
    if (foundId) {
      var stripped = text
        .replace(/\S*\/r\/[A-Za-z0-9_-]{6,16}\S*/g, "")
        .replace(/\S*[?&]r=[A-Za-z0-9_-]{6,16}\S*/g, "").trim();
      text = stripped || "I just took your quiz — here's my result.";
      loadResultContext(foundId, false);
    }

    addHer(text);
    history.push({ role: "user", content: text });
    input.value = "";
    autoGrow();
    setBusy(true);
    say("Sent. Zane is responding…");

    streamReply(addStreamingBubble());
  });

  // tel:/sms: link the crisis numbers so one tap dials at 2am
  function linkifyCrisis(node) {
    node.querySelectorAll("p").forEach(function (p) {
      p.innerHTML = p.innerHTML
        .replace(/\b988\b/g, '<a href="tel:988">988</a>')
        .replace(/1-800-799-7233/g, '<a href="tel:18007997233">1-800-799-7233</a>')
        .replace(/\b911\b/g, '<a href="tel:911">911</a>');
    });
  }

  // ---- the seven mirrors: tap one -> Zane opens on that exact ache,
  //      her own line sits drafted in the box, and we slide to the table ----
  var OPENERS = {
    invisible: {
      line: "I could disappear tomorrow and no one would notice.",
      opener: "You walk into a room and nothing changes. Like the air doesn't move for you anymore. I'm not going to tell you you're seen. I'll ask you one thing: when did you stop expecting to be?",
    },
    lost: {
      line: "I don't know who I am anymore.",
      opener: "You used to like things. A book. A song. A way you laughed. Tell me one thing you loved before everyone needed something from you. Just one. I'll wait.",
    },
    pleaser: {
      line: "I'm exhausted from never being anyone's first choice.",
      opener: "You're tired in a way sleep doesn't fix. That's the bill for being everyone's safe person and no one's first call. Who got the last yes you didn't mean?",
    },
    critic: {
      line: "If you could hear how I talk to myself, you'd agree I'm not enough.",
      opener: "That voice in your head — the one that's never impressed. Would you say a word of it to a friend? Then why does it get to live in you for free? Tell me the last thing it said today.",
    },
    never: {
      line: "I finish something good and feel nothing — just the next thing I got wrong.",
      opener: "You did the thing. It counted for about four seconds, then the next thing showed up. What did you finish lately that you never let yourself feel good about?",
    },
    behind: {
      line: "Everyone my age is ahead of me. I think I missed my window.",
      opener: "You're holding your messy middle next to everyone else's best photo. You already know the scoreboard's fake. So — behind who, exactly? Says who?",
    },
    impostor: {
      line: "One day they'll see the real me and realize I fooled them.",
      opener: "You think you fooled them. Here's what I see: someone who works twice as hard so nobody finds a crack. That's not a fraud. That's exhaustion. What are you so sure they'd find?",
    },
  };

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function seedFromCard(key) {
    if (busy) return;
    var data = OPENERS[key];
    if (!data) return;
    // Zane is already mid-sentence about her exact ache
    thread.innerHTML = "";
    var m = el("div", "msg zane intro");
    var p = el("p");
    p.textContent = data.opener;
    m.appendChild(p);
    thread.appendChild(m);
    history = [{ role: "assistant", content: data.opener }];
    // her own words, pre-drafted — she can send, edit, or just answer him
    input.value = data.line;
    autoGrow();
    var chat = document.getElementById("talk");
    if (chat) chat.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    input.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll(".mirror"), function (btn) {
    btn.addEventListener("click", function () { seedFromCard(btn.getAttribute("data-key")); });
  });

  function streamReply(bubble) {
    var acc = "";
    var started = false;
    var crisis = false;
    var ctrl = new AbortController();
    var watchdog;

    function arm() { clearTimeout(watchdog); watchdog = setTimeout(function () { ctrl.abort(); }, WATCHDOG_MS); }

    function render() {
      if (!started) { bubble.innerHTML = ""; started = true; }
      bubble.innerHTML = "";
      acc.split(/\n{2,}/).filter(function (s) { return s.trim().length; }).forEach(function (para) {
        var p = document.createElement("p");
        p.textContent = para.trim();
        bubble.appendChild(p);
      });
      scrollDown(false);
    }

    function finish() {
      clearTimeout(watchdog);
      if (!acc.trim()) { acc = "I'm still here. Say that again when you're ready."; render(); }
      if (crisis) { bubble.classList.add("crisis"); linkifyCrisis(bubble); }
      // reveal the finished message to screen readers as ONE clean announcement
      bubble.removeAttribute("aria-hidden");
      say("Zane replied.");
      history.push({ role: "assistant", content: acc.trim() });
      setBusy(false);
      input.focus();
    }

    arm();
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-16), resultId: resultId }),
      signal: ctrl.signal,
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error("no stream");
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = "";

        function pump() {
          return reader.read().then(function (chunk) {
            arm(); // reset watchdog on any byte
            if (chunk.done) return finish();
            buf += decoder.decode(chunk.value, { stream: true });
            var parts = buf.split("\n\n");
            buf = parts.pop();
            parts.forEach(function (block) {
              var line = block.split("\n").find(function (l) { return l.indexOf("data:") === 0; });
              if (!line) return;
              var payload = line.slice(5).trim();
              if (!payload) return;
              try {
                var obj = JSON.parse(payload);
                if (obj.delta) { acc += obj.delta; render(); }
                if (obj.risk === "crisis" || obj.risk === "danger") crisis = true;
              } catch (err) { /* ignore keep-alives */ }
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function () {
        clearTimeout(watchdog);
        // never destroy text she already read: keep the partial, only fill if empty
        if (!acc.trim()) {
          acc = "Something on my end dropped the thread. Give it a moment and say that again — I'm still here.";
          render();
        }
        bubble.removeAttribute("aria-hidden");
        say("Connection interrupted.");
        history.push({ role: "assistant", content: acc.trim() });
        setBusy(false);
        input.focus();
      });
  }
})();
