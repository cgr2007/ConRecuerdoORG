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
          from_name: formData.get("name"),
          reply_to: formData.get("email"),
          message: formData.get("message"),
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

    status.textContent = "Tu mensaje se ha enviado correctamente. Podrás enviar otro dentro de 5 minutos.";
  } catch (error) {
    console.error("No se pudo enviar el mensaje:", error);
    const detail = error instanceof Error ? error.message : String(error);
    status.textContent = `No se pudo enviar: ${detail}. Puedes volver a intentarlo o escribirnos a ${CONTACT_EMAIL}.`;
  } finally {
    submitButton.disabled = false;
  }
});
