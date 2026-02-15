document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const nicknameInput = document.getElementById('nickname');
    const campusSelect = document.getElementById('campus');

    // Load saved nickname and campus if available
    const savedNickname = localStorage.getItem('tiktalk_nickname');
    const savedCampus = localStorage.getItem('tiktalk_campus');
    
    if (savedNickname) {
        nicknameInput.value = savedNickname;
    }
    
    if (savedCampus) {
        campusSelect.value = savedCampus;
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nickname = nicknameInput.value.trim();
        const campus = campusSelect.value;

        // Validation
        if (!nickname || nickname.length < 3 || nickname.length > 20) {
            alert('Nickname must be 3-20 characters long');
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) {
            alert('Nickname can only contain letters, numbers, underscore, and hyphen');
            return;
        }

        if (!campus) {
            alert('Please select a campus');
            return;
        }

        // Save to localStorage
        localStorage.setItem('tiktalk_nickname', nickname);
        localStorage.setItem('tiktalk_campus', campus);

        // Redirect to chat
        window.location.href = '/chat.html';
    });

    // Load theme preference
    const savedTheme = localStorage.getItem('tiktalk_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
});
