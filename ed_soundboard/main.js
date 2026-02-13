import yaml from 'js-yaml';

async function init() {
    const soundboard = document.getElementById('soundboard');

    try {
        const response = await fetch('./edisms.yaml');
        const text = await response.text();
        const data = yaml.load(text);

        soundboard.innerHTML = ''; // Clear loading message

        if (!data.edisms || data.edisms.length === 0) {
            soundboard.innerHTML = '<p>No edisms found in public/edisms.yaml</p>';
            return;
        }

        const edisms = data.edisms;

        // Shuffle edisms for a random order each load
        for (let i = edisms.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [edisms[i], edisms[j]] = [edisms[j], edisms[i]];
        }

        // Collect all available sound paths for the "Random" button
        const allSounds = [];
        edisms.forEach(e => {
            if (e.sound) allSounds.push(e.sound);
            if (e.sounds) allSounds.push(...e.sounds);
        });

        let maiTaiClicks = 0;
        let maiTaiTimeout;

        edisms.forEach(edism => {
            const button = document.createElement('button');
            button.className = 'sound-button';

            // Set background image if it exists
            if (edism.image) {
                button.style.backgroundImage = `url(${edism.image})`;
            }

            // Create label
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = edism.label;

            // Add a default icon if no image
            if (!edism.image) {
                const icon = document.createElement('span');
                icon.className = 'placeholder-icon';
                icon.textContent = edism.is_random_all ? '🎲' : '🌺';
                button.appendChild(icon);
            }

            button.appendChild(label);

            // Audio logic
            button.addEventListener('click', () => {
                let soundToPlay;

                if (edism.is_random_all) {
                    // Pick any sound from the entire collection
                    soundToPlay = allSounds[Math.floor(Math.random() * allSounds.length)];
                } else if (edism.sounds && edism.sounds.length > 0) {
                    // Pick random from the specific list for this button
                    soundToPlay = edism.sounds[Math.floor(Math.random() * edism.sounds.length)];
                } else {
                    // Single sound
                    soundToPlay = edism.sound;
                }

                if (soundToPlay) {
                    const audio = new Audio(soundToPlay);
                    audio.play().catch(e => console.error("Error playing sound:", e));
                }

                // Mai Tai Easter Egg
                if (edism.label.includes('Mai Tai')) {
                    maiTaiClicks++;
                    clearTimeout(maiTaiTimeout);
                    if (maiTaiClicks >= 3) {
                        triggerExplosion(window.innerWidth / 2, window.innerHeight / 2);
                        maiTaiClicks = 0;
                    } else {
                        maiTaiTimeout = setTimeout(() => { maiTaiClicks = 0; }, 5000);
                    }
                }

                // Add a little visual kick
                button.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(0.9)' },
                    { transform: 'scale(1)' }
                ], {
                    duration: 150,
                    easing: 'ease-out'
                });
            });

            soundboard.appendChild(button);
        });

    } catch (error) {
        console.error('Failed to load edisms:', error);
        soundboard.innerHTML = '<p>Oops! Something went wrong loading the sounds.</p>';
    }
}

function triggerExplosion(x, y) {
    const count = 50;
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('span');
        particle.className = 'particle';
        particle.textContent = '🍹';

        // Random trajectory
        const angle = Math.random() * Math.PI * 2;
        const velocity = 200 + Math.random() * 800;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        const duration = 1000 + Math.random() * 2000;
        const tr = 360 + Math.random() * 720;

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        particle.style.setProperty('--tr', `${tr}deg`);
        particle.style.setProperty('--duration', `${duration}ms`);

        document.body.appendChild(particle);

        // Remove after animation
        setTimeout(() => particle.remove(), duration);
    }
}

document.addEventListener('DOMContentLoaded', init);
