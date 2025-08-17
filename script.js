// script.js — Front Scriptelix : appels API (fetch) + UI
// NOTE: change API_BASE quand tu déploies (mets l'URL de ton backend si différent)
const API_BASE = "http://127.0.0.1:8000";
const token = () => localStorage.getItem("access_token");

function authHeaders() {
  const t = token();
  return t ? { "Authorization": "Bearer " + t } : {};
}

async function api(path, {method="GET", body=null, auth=false} = {}) {
  const headers = { "Content-Type": "application/json", ...(auth ? authHeaders() : {}) };
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : null
    });
  } catch (e) {
    throw new Error("Impossible de contacter l'API. Vérifie que le backend tourne.");
  }
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = isJson ? (payload.detail || JSON.stringify(payload)) : (payload || ("HTTP " + res.status));
    throw new Error(msg);
  }
  return payload;
}

// --------------- Login ---------------
const btnLogin = document.getElementById("btnLogin");
if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    const statusEl = document.getElementById("loginStatus");
    if (statusEl) statusEl.textContent = "";
    try {
      // OAuth2PasswordRequestForm = form-encoded (pas JSON)
      const email = document.getElementById("lEmail").value.trim();
      const password = document.getElementById("lPassword").value;
      const params = new URLSearchParams();
      params.append("username", email); // côté API, "username" = email
      params.append("password", password);
      const res = await fetch(API_BASE + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Login failed");
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("username", data.username);
      localStorage.setItem("user_id", data.user_id);
      localStorage.setItem("is_admin", data.is_admin ? "1" : "0");
      if (statusEl) statusEl.textContent = "Connecté !";
    } catch (e) {
      if (statusEl) statusEl.textContent = "Erreur: " + e.message;
      else alert("Erreur: " + e.message);
    }
  });
}

// --------------- Register ---------------
const btnRegister = document.getElementById("btnRegister");
if (btnRegister) {
  btnRegister.addEventListener("click", async () => {
    try {
      const payload = {
        username: document.getElementById("rUsername").value.trim(),
        email: document.getElementById("rEmail").value.trim(),
        password: document.getElementById("rPassword").value
      };
      await api("/auth/register", {method:"POST", body:payload});
      alert("Compte créé. Vous pouvez vous connecter.");
      window.location.href = "login.html";
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  });
}

// --------------- Sondages (liste + répondre) ---------------
const pollList = document.getElementById("pollList");
const respondSection = document.getElementById("respondSection");
if (pollList) {
  (async () => {
    try {
      const surveys = await api("/surveys");
      pollList.innerHTML = "";
      surveys.forEach(s => {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          <strong>${s.title}</strong><br/>
          <span class="muted">${s.question}</span><br/>
          <button class="btn btn-outline" data-id="${s.id}">Répondre</button>
        `;
        pollList.appendChild(div);
        div.querySelector("button").addEventListener("click", () => loadSurveyForRespond(s.id));
      });
    } catch (e) {
      pollList.innerHTML = `<p class="muted">Erreur: ${e.message}</p>`;
    }
  })();
}

async function loadSurveyForRespond(id) {
  const s = await api("/surveys/" + id);
  document.getElementById("pollTitle").textContent = s.title;
  document.getElementById("pollQuestion").textContent = s.question;
  const box = document.getElementById("pollOptions");
  box.innerHTML = "";
  s.options.forEach(opt => {
    const line = document.createElement("div");
    line.innerHTML = `<label><input type="radio" name="opt" value="${opt.id}"> ${opt.text}</label>`;
    box.appendChild(line);
  });
  respondSection.classList.remove("hidden");
  const chooseHint = document.getElementById("chooseHint");
  if (chooseHint) chooseHint.classList.add("hidden");

  const btn = document.getElementById("btnRespond");
  btn.onclick = async () => {
    const chosen = document.querySelector('input[name="opt"]:checked');
    if (!chosen) return alert("Choisissez une option");
    // Tentative avec token d'abord
    try {
      await api(`/surveys/${id}/respond`, {method:"POST", body:{option_id: parseInt(chosen.value)}, auth:true});
      alert("Réponse envoyée !");
    } catch (e) {
      // Fallback anonyme (marche car token optionnel côté backend)
      try {
        await api(`/surveys/${id}/respond`, {method:"POST", body:{option_id: parseInt(chosen.value)}, auth:false});
        alert("Réponse envoyée en anonyme !");
      } catch (e2) {
        alert("Erreur: " + e2.message);
      }
    }
  };
}

// --------------- Résultats (Chart.js) ---------------
const selectSurvey = document.getElementById("selectSurvey");
const btnLoadResults = document.getElementById("btnLoadResults");
if (selectSurvey) {
  (async () => {
    try {
      const list = await api("/surveys");
      list.forEach(s => {
        const o = document.createElement("option");
        o.value = s.id; o.textContent = s.title;
        selectSurvey.appendChild(o);
      });
    } catch (e) {
      const table = document.getElementById("resultsTable");
      if (table) table.innerHTML = `<tr><td>Erreur: ${e.message}</td></tr>`;
    }
  })();
}
let chart = null;
if (btnLoadResults) {
  btnLoadResults.addEventListener("click", async () => {
    try {
      const id = selectSurvey.value;
      const data = await api("/surveys/" + id + "/results");
      const labels = data.map(d => d.text);
      const counts = data.map(d => d.count);
      const ctx = document.getElementById("chart").getContext("2d");
      if (chart) chart.destroy();
      chart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Votes", data: counts }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
      // Table
      const table = document.getElementById("resultsTable");
      table.innerHTML = "<tr><th>Option</th><th>Votes</th></tr>" + data.map(d => `<tr><td>${d.text}</td><td>${d.count}</td></tr>`).join("");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  });
}

// --------------- Forum (comments) ---------------
const forumSurvey = document.getElementById("forumSurvey");
if (forumSurvey) {
  (async () => {
    try {
      const list = await api("/surveys");
      list.forEach(s => {
        const o = document.createElement("option");
        o.value = s.id; o.textContent = s.title;
        forumSurvey.appendChild(o);
      });
      await loadComments();
    } catch (e) {
      const box = document.getElementById("comments");
      if (box) box.innerHTML = `<p class="muted">Erreur: ${e.message}</p>`;
    }
  })();
  forumSurvey.addEventListener("change", loadComments);
}

async function loadComments() {
  const surveyId = forumSurvey.value;
  const comments = await api("/surveys/" + surveyId + "/comments");
  const box = document.getElementById("comments");
  box.innerHTML = comments.map(c => `<div class="card"><strong>#${c.user_id}</strong><br/>${c.content}</div>`).join("");
  const logged = !!token();
  const cb = document.getElementById("commentBox");
  const hint = document.getElementById("loginHint");
  if (cb) cb.classList.toggle("hidden", !logged);
  if (hint) hint.classList.toggle("hidden", logged);
}

const btnComment = document.getElementById("btnComment");
if (btnComment) {
  btnComment.addEventListener("click", async () => {
    const surveyId = forumSurvey.value;
    const content = document.getElementById("commentInput").value.trim();
    if (!content) return alert("Écris un commentaire.");
    try {
      await api("/surveys/" + surveyId + "/comments", {method:"POST", body:{content}, auth:true});
      document.getElementById("commentInput").value = "";
      await loadComments();
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  });
}

// --------------- Profil + recherche ---------------
const meBox = document.getElementById("meBox");
if (meBox) {
  (async () => {
    try {
      const me = await api("/users/me", {auth:true});
      meBox.innerHTML = `
        <p><strong>Pseudo :</strong> ${me.username}</p>
        <p><strong>Email :</strong> ${me.email}</p>
        <p><strong>Admin :</strong> ${me.is_admin ? "Oui" : "Non"}</p>
        <p><strong>Profil public :</strong> ${me.profile_public ? "Oui" : "Non"}</p>
      `;
    } catch {
      meBox.innerHTML = "<p>Non connecté. Allez sur la page Connexion.</p>";
    }
  })();
}

const btnSearchUser = document.getElementById("btnSearchUser");
if (btnSearchUser) {
  btnSearchUser.addEventListener("click", async () => {
    try {
      const q = document.getElementById("searchUserInput").value.trim();
      const users = await api("/users/search?q=" + encodeURIComponent(q));
      const box = document.getElementById("searchResults");
      if (!users.length) return box.innerHTML = "<p>Aucun résultat</p>";
      // sécurité: on n’affiche pas l’email en public par défaut
      box.innerHTML = users.map(u => `<div class="card"><strong>${u.username}</strong></div>`).join("");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  });
}

// --------------- Admin ---------------
const btnCreateSurvey = document.getElementById("btnCreateSurvey");
if (btnCreateSurvey) {
  btnCreateSurvey.addEventListener("click", async () => {
    const title = document.getElementById("sTitle").value.trim();
    const question = document.getElementById("sQuestion").value.trim();
    const is_public = document.getElementById("sPublic").checked;
    const options = document.getElementById("sOptions").value
      .split("\n").map(s => s.trim()).filter(Boolean).map(text => ({text}));
    if (!title || !question || options.length < 2) return alert("Renseigne titre, question et au moins 2 options.");
    try {
      const s = await api("/surveys", {method:"POST", body:{title, question, is_public, options}, auth:true});
      alert("Sondage créé (#" + s.id + ").");
    } catch (e) {
      alert("Erreur: " + e.message + " (êtes-vous admin ?)");
    }
  });
}

const btnSetRole = document.getElementById("btnSetRole");
if (btnSetRole) {
  btnSetRole.addEventListener("click", async () => {
    const userId = parseInt(document.getElementById("roleUserId").value);
    const isAdmin = document.getElementById("roleValue").value === "true";
    if (!userId) return alert("ID utilisateur invalide");
    try {
      await api("/admin/users/" + userId + "/role?is_admin=" + isAdmin, {method:"PATCH", auth:true});
      alert("Rôle mis à jour.");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  });
}
