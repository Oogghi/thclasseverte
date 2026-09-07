// scripts/index.js
import { loginAdmin, isAdminLoggedIn } from './crypto-auth.js?v=20260903_v4';

const passwordPopup     = document.getElementById('password-popup');
const userPasswordInput = document.getElementById('user-password');
const submitPasswordBtn = document.getElementById('submit-password');
const errorMsg          = document.getElementById('error-msg');

async function validatePassword() {
  if (!userPasswordInput || !passwordPopup) return;
  const pass = userPasswordInput.value;
  if (!pass) return;

  if (submitPasswordBtn) {
    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = 'Vérification...';
  }

  const ok = await loginAdmin(pass);

  if (ok) {
    const content = passwordPopup.querySelector('.popup-content');
    if (content) content.classList.add('modal-exit');
    passwordPopup.classList.add('overlay-exit');
    setTimeout(() => {
      passwordPopup.style.display = 'none';
      if (errorMsg) errorMsg.style.display = 'none';
    }, 190);
  } else {
    if (errorMsg) {
      errorMsg.textContent = 'Mot de passe incorrect !';
      errorMsg.style.display = 'block';
    }
    userPasswordInput.value = '';
    userPasswordInput.focus();
  }

  if (submitPasswordBtn) {
    submitPasswordBtn.disabled = false;
    submitPasswordBtn.textContent = 'Valider';
  }
}

if (submitPasswordBtn) {
  submitPasswordBtn.addEventListener('click', validatePassword);
}

if (userPasswordInput) {
  userPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && submitPasswordBtn) {
      submitPasswordBtn.click();
    }
  });
}

if (isAdminLoggedIn() && passwordPopup) {
  passwordPopup.style.display = 'none';
}