const CONTACT_EMAIL = "cgrpages@gmail.com";
const EMAILJS_SERVICE_ID = "service_rorf8ly";
const EMAILJS_TEMPLATE_ID = "template_stxo17c";
const EMAILJS_PUBLIC_KEY = "PHVOQi_NbyteqKrv_";
const SEND_COOLDOWN_MS = 5 * 60 * 1000;
const LAST_SEND_KEY = "con-recuerdos-last-successful-send";
let lastSuccessfulSendAt = 0;

const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");
const contactForm = document.querySelector("#contact-form");
const calendarDays = document.querySelector("#calendar-days");
const monthTitle = document.querySelector("#month-title");
const calendarStatus = document.querySelector("#calendar-status");
const weeklyActivities = document.querySelector("#weekly-activities");
const weeklyScheduleNote = document.querySelector("#weekly-schedule-note");
const supabaseSettings = window.CON_RECUERDOS_SUPABASE || {};
const supabaseConfigured = Boolean(supabaseSettings.url && supabaseSettings.anonKey);
const scheduledActivities = new Map([
  [1, [{ time: "10:00", name: "Memoria" }]],
  [3, [{ time: "16:00", name: "Manualidades" }]],
]);
let supabaseClient = null;
let calendarRequestId = 0;
let displayedMonth = new Date();
displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);

if (supabaseConfigured && window.supabase?.createClient) {
  try {
    supabaseClient = window.supabase.createClient(supabaseSettings.url, supabaseSettings.anonKey);
  } catch (error) {
    console.error("No se pudo inicializar Supabase para el calendario:", error);
  }
}

function formatDatabaseDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function renderWeeklySchedule(activities) {
  weeklyActivities.replaceChildren();
  const sortedActivities = [...activities].sort((first, second) => {
    const firstDate = new Date(`${first.activity_date}T00:00:00`);
    const secondDate = new Date(`${second.activity_date}T00:00:00`);
    const firstDay = firstDate.getDay() || 7;
    const secondDay = secondDate.getDay() || 7;
    return firstDay - secondDay || first.activity_time.localeCompare(second.activity_time);
  });

  if (sortedActivities.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "weekly-empty";
    emptyMessage.textContent = "No hay actividades semanales programadas.";
    weeklyActivities.append(emptyMessage);
  } else {
    sortedActivities.forEach((activity) => {
      const item = document.createElement("article");
      item.className = "weekly-activity";
      const day = document.createElement("span");
      day.className = "weekly-day";
      day.textContent = new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
      }).format(new Date(`${activity.activity_date}T00:00:00`));
      const time = document.createElement("span");
      time.className = "weekly-time";
      time.textContent = activity.activity_time.slice(0, 5);
      const title = document.createElement("span");
      title.className = "weekly-name";
      title.textContent = activity.title;
      item.append(day, time, title);
      weeklyActivities.append(item);
    });
  }

  const participation = document.createTextNode("¿Quieres participar? ");
  const contactLink = document.createElement("a");
  contactLink.href = "#contacto";
  contactLink.textContent = "Hablemos";
  weeklyScheduleNote.replaceChildren(participation, contactLink);
  if (sortedActivities.length > 0) {
    weeklyScheduleNote.append(document.createTextNode(" y te contamos cómo."));
  }
}

async function getCalendarActivities(startDate, endDate) {
  const activitiesByDate = new Map();
  if (!supabaseConfigured) {
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const activities = scheduledActivities.get(date.getDay());
      if (activities) activitiesByDate.set(formatDatabaseDate(date), activities);
    }
    return { activitiesByDate, recurringActivities: null };
  }

  if (!supabaseClient) {
    throw new Error("No se pudo inicializar el cliente de Supabase.");
  }

  const [oneOffResult, recurringResult] = await Promise.all([
    supabaseClient
      .from("activities")
      .select("activity_date, activity_time, title")
      .eq("repeat_weekly", false)
      .gte("activity_date", formatDatabaseDate(startDate))
      .lte("activity_date", formatDatabaseDate(endDate))
      .order("activity_time", { ascending: true }),
    supabaseClient
      .from("activities")
      .select("activity_date, activity_time, title")
      .eq("repeat_weekly", true)
      .lte("activity_date", formatDatabaseDate(endDate))
      .order("activity_time", { ascending: true }),
  ]);

  if (oneOffResult.error) throw oneOffResult.error;
  if (recurringResult.error) throw recurringResult.error;

  oneOffResult.data.forEach((activity) => {
    const activities = activitiesByDate.get(activity.activity_date) || [];
    activities.push({
      time: activity.activity_time.slice(0, 5),
      name: activity.title,
    });
    activitiesByDate.set(activity.activity_date, activities);
  });

  recurringResult.data.forEach((activity) => {
    const activityStartDate = new Date(`${activity.activity_date}T00:00:00`);
    const startWeekday = activityStartDate.getDay();
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      if (date < activityStartDate || date.getDay() !== startWeekday) continue;
      const activities = activitiesByDate.get(formatDatabaseDate(date)) || [];
      activities.push({
        time: activity.activity_time.slice(0, 5),
        name: activity.title,
      });
      activitiesByDate.set(formatDatabaseDate(date), activities);
    }
  });

  activitiesByDate.forEach((activities) => {
    activities.sort((first, second) => first.time.localeCompare(second.time));
  });

  return { activitiesByDate, recurringActivities: recurringResult.data };
}

async function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstVisibleDate = new Date(year, month, 1 - ((firstOfMonth.getDay() + 6) % 7));
  const lastVisibleDate = new Date(firstVisibleDate);
  lastVisibleDate.setDate(firstVisibleDate.getDate() + 41);
  const requestId = ++calendarRequestId;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const monthLabel = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(displayedMonth);
  monthTitle.textContent = monthLabel.charAt(0).toLocaleUpperCase("es-ES") + monthLabel.slice(1);
  calendarDays.replaceChildren();
  calendarStatus.textContent = "";

  let calendarData;
  try {
    calendarData = await getCalendarActivities(firstVisibleDate, lastVisibleDate);
  } catch (error) {
    console.error("No se pudieron cargar las actividades del calendario:", error);
    if (requestId === calendarRequestId) {
      calendarStatus.textContent = "No se pudieron cargar las actividades. Inténtalo de nuevo más tarde.";
      if (supabaseConfigured) {
        weeklyActivities.replaceChildren();
        weeklyScheduleNote.textContent = "No se pudo cargar el horario semanal.";
      }
    }
    return;
  }
  if (requestId !== calendarRequestId) return;
  if (supabaseConfigured) renderWeeklySchedule(calendarData.recurringActivities);

  const weeks = [];
  let eventCount = 0;
  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = document.createElement("div");
    week.className = "calendar-week";
    week.setAttribute("role", "row");

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(firstVisibleDate);
      date.setDate(firstVisibleDate.getDate() + weekIndex * 7 + dayIndex);
      const events = calendarData.activitiesByDate.get(formatDatabaseDate(date)) || [];
      if (date.getMonth() === month) eventCount += events.length;
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const day = document.createElement("div");
      day.className = "calendar-day";
      day.setAttribute("role", "gridcell");

      if (date.getMonth() !== month) day.classList.add("is-outside");
      if (dateKey === todayKey) {
        day.classList.add("is-today");
        day.setAttribute("aria-current", "date");
      }

      const dateLabel = new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
      const eventLabel = events.map(({ time, name }) => `${time}, ${name}`).join("; ");
      day.setAttribute("aria-label", eventLabel ? `${dateLabel}: ${eventLabel}` : dateLabel);

      const dateNumber = document.createElement("span");
      dateNumber.className = "calendar-date";
      dateNumber.textContent = String(date.getDate());
      day.append(dateNumber);

      events.forEach(({ time, name }) => {
        const event = document.createElement("span");
        event.className = "calendar-event";
        const eventTime = document.createElement("span");
        eventTime.className = "calendar-event-time";
        eventTime.textContent = time;
        event.append(eventTime, document.createTextNode(name));
        day.append(event);
      });

      week.append(day);
    }
    weeks.push(week);
  }

  calendarDays.replaceChildren(...weeks);
  if (supabaseConfigured && eventCount === 0) {
    calendarStatus.textContent = "No hay actividades programadas para este mes.";
  }
}

document.querySelector("#previous-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.querySelector("#next-month").addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});

renderCalendar();

menuToggle.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Abrir menú" : "Cerrar menú");
  mainNav.classList.toggle("is-open", !isOpen);
});

mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menú");
    mainNav.classList.remove("is-open");
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const status = document.querySelector("#form-status");
  if (!EMAILJS_TEMPLATE_ID) {
    status.textContent = `Falta configurar la plantilla de EmailJS. Mientras tanto, escríbenos a ${CONTACT_EMAIL}.`;
    return;
  }

  try {
    const storedLastSend = localStorage.getItem(LAST_SEND_KEY);
    const storedTimestamp = storedLastSend === null ? 0 : Number(storedLastSend);
    if (storedLastSend !== null && !Number.isFinite(storedTimestamp)) {
      localStorage.removeItem(LAST_SEND_KEY);
    }

    const lastSend = Math.max(
      lastSuccessfulSendAt,
      Number.isFinite(storedTimestamp) ? storedTimestamp : 0,
    );
    const remaining = lastSend + SEND_COOLDOWN_MS - Date.now();
    if (remaining > 0) {
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      status.textContent = `Espera ${minutes} min ${seconds} s antes de volver a enviar un mensaje.`;
      return;
    }

  } catch (error) {
    console.error("No se pudo activar el límite de envíos:", error);
    status.textContent = "Este navegador no permite guardar el límite de envíos; no se ha enviado el mensaje.";
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  submitButton.disabled = true;
  status.textContent = "Enviando mensaje...";

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          name: formData.get("name"),
          title: formData.get("message"),
          to_email: formData.get("email"),
          reply_to: formData.get("email"),
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`EmailJS respondió con HTTP ${response.status}: ${detail}`);
    }

    form.reset();
    lastSuccessfulSendAt = Date.now();
    try {
      localStorage.setItem(LAST_SEND_KEY, String(lastSuccessfulSendAt));
    } catch (error) {
      console.error("Se envió el correo, pero no se pudo actualizar el límite guardado:", error);
      status.textContent = "Tu mensaje se envió, pero no se pudo actualizar el límite de cinco minutos en este navegador.";
      return;
    }

    status.textContent = "Enviamos la confirmación a tu correo y una copia a la asociación. Podrás enviar otro mensaje dentro de 5 minutos.";
  } catch (error) {
    console.error("No se pudo enviar el mensaje:", error);
    const detail = error instanceof Error ? error.message : String(error);
    status.textContent = `No se pudo enviar: ${detail}. Puedes volver a intentarlo o escribirnos a ${CONTACT_EMAIL}.`;
  } finally {
    submitButton.disabled = false;
  }
});
