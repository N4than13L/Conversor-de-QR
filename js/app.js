const contenedorQr = document.getElementById("contenedorQR");
const formulario = document.getElementById("formulario");
const limpiar = document.getElementById("limpiar");
var mensaje = document.getElementById("mensaje");

mensaje.classList.remove("alert");
const QR = new QRCode(contenedorQr);

formulario.addEventListener("submit", (e) => {
  e.preventDefault();
  QR.makeCode(formulario.enlace.value);
  mensaje.innerText = "Cógido QR generado exitosamente";
});

limpiar.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("enlace").value = "";
  mensaje.value = "";
});
