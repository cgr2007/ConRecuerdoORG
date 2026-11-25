const loginPanel = document.querySelector("#login-panel");
const managementPanel = document.querySelector("#management-panel");
const adminStatus = document.querySelector("#admin-status");
const loginForm = document.querySelector("#login-form");
const activityForm = document.querySelector("#activity-form");
const activityList = document.querySelector("#admin-activities");
const activityDateInput = document.querySelector("#activity-date");
const supabaseSettings = window.CON_RECUERDOS_SUPABASE || {};
const supabaseConfigured = Boolean(supabaseSettings.url && supabaseSettings.anonKey);
let supabaseClient = null;
let currentUser = null;

function setStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.classList.toggle("is-error", isError);
}

function getLocalDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function setAuthenticated(user) {
  currentUser = user;
  loginPanel.hidden = Boolean(user);
  managementPanel.hidden = !user;
}

function makeActivityItem(activity) {
  const item = document.createElement("li");
  item.className = "admin-activity-item";

  const details = document.createElement("div");
  details.className = "admin-activity-details";

  const date = document.createElement("p");
  date.className = "admin-activity-date";
  const formattedDate = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${activity.activity_date}T00:00:00`));
  date.textContent = activity.repeat_weekly ? `Cada semana desde el ${formattedDate}` : formattedDate;

  const title = document.createElement("h3");
  title.textContent = `${activity.activity_time.slice(0, 5)} · ${activity.title}`;
  details.append(date, title);

  if (activity.description) {
    const description = document.createElement("p");
    description.textContent = activity.description;
    details.append(description);
  }

  const deleteButton = document.createElement("button");
  deleteButton.className = "admin-delete";
  deleteButton.type = "button";
  deleteButton.textContent = "Eliminar";
  deleteButton.setAttribute("aria-label", `Eliminar ${activity.title}`);
  deleteButton.addEventListener("click", () => deleteActivity(activity.id, activity.title));

  item.append(details, deleteButton);
  return item;
}

async function loadActivities() {
  const { data, error } = await supabaseClient
    .from("activities")
    .select("id, activity_date, activity_time, title, description, repeat_weekly")
    .or(`activity_date.gte.${getLocalDateString()},repeat_weekly.eq.true`)
    .order("activity_date", { ascending: true })
    .order("activity_time", { ascending: true })
    .limit(100);

  if (error) throw error;

  const items = data.map(makeActivityItem);
  if (items.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "admin-activity-empty";
    emptyMessage.textContent = "Todavía no hay actividades programadas.";
    items.push(emptyMessage);
  }
  activityList.replaceChildren(...items);
}

async function deleteActivity(activityId, title) {
  if (!window.confirm(`¿Quieres eliminar la actividad «${title}»?`)) return;

  try {
    const { error } = await supabaseClient.from("activities").delete().eq("id", activityId);
    if (error) throw error;
    await loadActivities();
    setStatus("Actividad eliminada.");
  } catch (error) {
    console.error("No se pudo eliminar la actividad:", error);
    setStatus(`No se pudo eliminar la actividad: ${error.message}`, true);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;

  const submitButton = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  submitButton.disabled = true;
  setStatus("Iniciando sesión...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (error) throw error;

    loginForm.reset();
    setAuthenticated(data.user);
    await loadActivities();
    setStatus("Sesión iniciada.");
  } catch (error) {
    console.error("No se pudo iniciar sesión o cargar las actividades:", error);
    setStatus(`No se pudo iniciar sesión o cargar las actividades: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient || !currentUser) return;

  const submitButton = activityForm.querySelector('button[type="submit"]');
  const formData = new FormData(activityForm);
  const date = String(formData.get("date"));
  if (date < getLocalDateString()) {
    setStatus("Elige hoy o una fecha futura para la actividad.", true);
    return;
  }

  submitButton.disabled = true;
  setStatus("Guardando actividad...");

  try {
    const { error } = await supabaseClient.from("activities").insert({
      title: String(formData.get("title")).trim(),
      activity_date: date,
      activity_time: formData.get("time"),
      description: String(formData.get("description")).trim(),
      repeat_weekly: formData.get("repeat") === "on",
      created_by: currentUser.id,
    });
    if (error) throw error;

    activityForm.reset();
    activityDateInput.value = getLocalDateString();
    await loadActivities();
    setStatus("Actividad publicada en el calendario.");
  } catch (error) {
    console.error("No se pudo guardar la actividad:", error);
    setStatus(`No se pudo guardar la actividad: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#refresh-activities").addEventListener("click", async () => {
  try {
    await loadActivities();
    setStatus("Lista actualizada.");
  } catch (error) {
    console.error("No se pudieron cargar las actividades:", error);
    setStatus(`No se pudieron cargar las actividades: ${error.message}`, true);
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    setAuthenticated(null);
    setStatus("Has cerrado sesión.");
  } catch (error) {
    console.error("No se pudo cerrar sesión:", error);
    setStatus(`No se pudo cerrar sesión: ${error.message}`, true);
  }
});

async function initializeAdmin() {
  if (!supabaseConfigured) {
    loginForm.querySelector('button[type="submit"]').disabled = true;
    setStatus("Falta vincular el proyecto Supabase. Sigue los pasos de configuración del README.", true);
    return;
  }

  if (!window.supabase?.createClient) {
    loginForm.querySelector('button[type="submit"]').disabled = true;
    setStatus("No se pudo cargar Supabase. Comprueba tu conexión e inténtalo de nuevo.", true);
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey);
    activityDateInput.min = getLocalDateString();
    activityDateInput.value = getLocalDateString();

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) {
      setAuthenticated(data.session.user);
      await loadActivities();
    }

    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setAuthenticated(null);
    });
  } catch (error) {
    console.error("No se pudo inicializar el panel de administración:", error);
    setStatus(`No se pudo conectar con Supabase: ${error.message}`, true);
  }
}

initializeAdmin();
