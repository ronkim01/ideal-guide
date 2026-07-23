import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

// Supabase 클라이언트 생성 (공개용 키 사용)
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const form = document.getElementById("form");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const submitBtn = document.getElementById("submit");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status " + (kind || "");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("ko-KR");
  } catch {
    return iso;
  }
}

// 방명록 목록 불러오기
async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (error.code === "PGRST205") {
      setStatus("⚠️ 'messages' 테이블이 아직 없습니다. supabase-setup.sql을 Supabase에서 실행하세요.", "error");
    } else {
      setStatus("불러오기 오류: " + error.message, "error");
    }
    return;
  }

  setStatus("✅ Supabase 연결됨 · 메시지 " + data.length + "개", "ok");

  if (data.length === 0) {
    listEl.innerHTML = '<li class="empty">아직 남긴 글이 없어요. 첫 글을 남겨보세요!</li>';
    return;
  }

  listEl.innerHTML = data.map((m) => `
    <li class="item">
      <div class="item-head">
        <span class="item-name">${escapeHtml(m.name || "익명")}</span>
        <span class="item-date">${formatDate(m.created_at)}</span>
      </div>
      <div class="item-body">${escapeHtml(m.content)}</div>
    </li>
  `).join("");
}

// 새 글 저장
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim() || "익명";
  const content = messageInput.value.trim();
  if (!content) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "저장 중...";

  const { error } = await supabase.from("messages").insert({ name, content });

  submitBtn.disabled = false;
  submitBtn.textContent = "남기기";

  if (error) {
    setStatus("저장 오류: " + error.message, "error");
    return;
  }

  messageInput.value = "";
  await loadMessages();
});

// 첫 로딩
setStatus("Supabase에 연결 중...", "");
loadMessages();
