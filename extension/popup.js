// 팝업: 연동 토큰을 chrome.storage.sync 에 저장/표시.
const $ = (id) => document.getElementById(id);
const JJM_URL = "https://jeonjeokmon.vercel.app/";

function setStatus(msg, ok) {
  const el = $("status");
  el.textContent = msg;
  el.style.color = ok === false ? "#ff9b9b" : "#9fd0a6";
}

chrome.storage.sync.get(["aegisToken"], (r) => {
  const t = (r && r.aegisToken) || "";
  $("token").value = t;
  setStatus(t ? "연동됨 ✓ — Aegis에 로그인한 채로 두면 자동 기록됩니다." : "토큰을 입력하고 저장하세요.", t ? true : undefined);
});

$("save").addEventListener("click", () => {
  const token = $("token").value.trim();
  if (!token || token.length < 8) {
    setStatus("토큰이 올바르지 않습니다.", false);
    return;
  }
  chrome.storage.sync.set({ aegisToken: token }, () => {
    setStatus("저장됨 ✓ — Aegis 탭을 새로고침하면 바로 기록됩니다.", true);
  });
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: JJM_URL });
});
