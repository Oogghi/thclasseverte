  const mdpCorrect = "thClasseVerte123";
  const popup = document.getElementById("password-popup");
  const input = document.getElementById("user-password");
  const btn = document.getElementById("submit-password");
  const errorMsg = document.getElementById("error-msg");

  // Vérifie si l'utilisateur a déjà validé le mot de passe
  if(localStorage.getItem("mdpOk") === "true"){
    popup.style.display = "none";
  }

  btn.addEventListener("click", () => {
    if(input.value === mdpCorrect){
      localStorage.setItem("mdpOk", "true"); // mémorise l'accès
      popup.style.display = "none"; // ferme la popup
    } else {
      errorMsg.style.display = "block"; // affiche message d'erreur
      input.value = "";
    }
  });

  // validation avec Entrée
  input.addEventListener("keydown", (e) => {
    if(e.key === "Enter") btn.click();
  });