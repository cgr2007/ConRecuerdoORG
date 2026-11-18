const CONTACT_EMAIL = "cgrpages@gmail.com";

const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");

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

document.querySelector("#contact-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const status = document.querySelector("#form-status");
  if (!CONTACT_EMAIL) {
    status.textContent = "El correo de contacto aún no está configurado. Añádelo en script.js para poder preparar el envío.";
    return;
  }

  const formData = new FormData(event.currentTarget);
  const subject = encodeURIComponent(`Consulta desde la web de Con Recuerdos: ${formData.get("name")}`);
  const body = encodeURIComponent(
    `Nombre: ${formData.get("name")}\nCorreo: ${formData.get("email")}\n\n${formData.get("message")}`,
  );
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  status.textContent = "Se ha preparado el mensaje en tu aplicación de correo. Envíalo desde allí para que podamos recibirlo.";
});
