const passwordPopup   = document.getElementById('password-popup');
const userPasswordInput = document.getElementById('user-password');
const submitPasswordBtn = document.getElementById('submit-password');
const errorMsg          = document.getElementById('error-msg');

const TARGET_HASH = 'cccf2f2d8fc19733dd9e69704d54e35a14771494383c50e8645100ddd14ac3a2';

async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validatePassword() {
  if (!userPasswordInput || !passwordPopup) return;
  const enteredHash = await hashPassword(userPasswordInput.value);
  if (enteredHash === TARGET_HASH) {
    localStorage.setItem('mdpOk', 'true');
    passwordPopup.style.display = 'none';
  } else {
    if (errorMsg) errorMsg.style.display = 'block';
    userPasswordInput.value = '';
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

if (localStorage.getItem('mdpOk') === 'true' && passwordPopup) {
  passwordPopup.style.display = 'none';
}