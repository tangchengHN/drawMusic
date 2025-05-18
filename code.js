document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('doodleCanvas');
    const canvasContainer = document.getElementById('canvasContainer');
    
    if (!canvas) {
        console.error("Canvas element #doodleCanvas not found!");
        alert("错误：找不到画板元素！请检查HTML。");
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Unable to get 2D context for canvas.");
        alert("错误：无法初始化画板绘图环境！您的浏览器可能不支持。");
        return;
    }

    const playSoundBtn = document.getElementById('playSoundBtn');
    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    const lineWidthInput = document.getElementById('lineWidth');
    const lineWidthValueDisplay = document.getElementById('lineWidthValue');
    const brushOptions = document.querySelectorAll('.brush-option');

    let audioContext;
    let isDrawing = false;
    let currentBrushColor = '#FF0000'; // Default to red

    const PALETTE_INSTRUMENTS = {
        '#FF0000': 'piano',
        '#00FF00': 'musicbox',
        '#0000FF': 'organ',
        '#FFFF00': 'synthpluck',
        '#000000': 'sinebass',
    };

    // Helper to parse hex color to RGB object
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }


    function setCanvasDrawingDefaults() {
        ctx.strokeStyle = currentBrushColor;
        ctx.lineWidth = lineWidthInput.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    
    function resizeCanvas() {
        const container = canvas.parentElement;
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        } else {
            console.warn("Canvas parent container not found for sizing. Using fallback dimensions.");
            canvas.width = 700; 
            canvas.height = 400;
        }
        setCanvasDrawingDefaults();
        clearCanvasContent(false); // Clear without confirmation on resize
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    lineWidthInput.addEventListener('input', () => {
        lineWidthValueDisplay.textContent = lineWidthInput.value;
        if (isDrawing) { 
            setCanvasDrawingDefaults();
        }
    });

    brushOptions.forEach(brush => {
        brush.addEventListener('click', () => {
            brushOptions.forEach(b => b.classList.remove('active'));
            brush.classList.add('active');
            currentBrushColor = brush.dataset.color;
            if (isDrawing) { // Update current path's style if drawing
                setCanvasDrawingDefaults();
            }
        });
    });


    function getEventPosition(evt) {
        const rect = canvas.getBoundingClientRect();
        if (evt.touches && evt.touches.length > 0) {
            return { x: evt.touches[0].clientX - rect.left, y: evt.touches[0].clientY - rect.top };
        }
        return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function startDrawing(e) {
        if (e.touches) e.preventDefault(); 
        isDrawing = true;
        setCanvasDrawingDefaults();
        const pos = getEventPosition(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!isDrawing) return;
        if (e.touches) e.preventDefault();
        const pos = getEventPosition(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function stopDrawing() {
        if (isDrawing) {
            isDrawing = false;
        }
    }

    function clearCanvasContent(confirm = true) {
        if (confirm) {
            // Optional: Add a confirmation dialog if you want
            // if (!window.confirm("Are you sure you want to clear the canvas?")) return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
    canvas.addEventListener('touchcancel', stopDrawing);

    clearCanvasBtn.addEventListener('click', () => clearCanvasContent(true));

    playSoundBtn.addEventListener('click', () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(convertDrawingToSound).catch(e => console.error("Error resuming AudioContext:", e));
        } else {
            convertDrawingToSound();
        }
    });

    function getInstrumentFromPixelColor(r_pixel, g_pixel, b_pixel) {
        let closestInstrument = PALETTE_INSTRUMENTS['#000000']; // Default to black's instrument
        let minDistance = Infinity;
    
        for (const hexColor in PALETTE_INSTRUMENTS) {
            const paletteRgb = hexToRgb(hexColor);
            if (!paletteRgb) continue;
    
            // Calculate squared Euclidean distance (faster than sqrt)
            const distance = Math.pow(r_pixel - paletteRgb.r, 2) +
                             Math.pow(g_pixel - paletteRgb.g, 2) +
                             Math.pow(b_pixel - paletteRgb.b, 2);
    
            if (distance < minDistance) {
                minDistance = distance;
                closestInstrument = PALETTE_INSTRUMENTS[hexColor];
            }
        }
        // If the closest color is very close (e.g., distance < 100, for squared distance), use it.
        // For simplicity here, we just take the absolute closest.
        // A small distance threshold (e.g., minDistance < 10*10 for squared, so sum of diffs < 10)
        // could make it more robust against anti-aliased pixels if they are far from any palette color.
        // However, since we draw with exact colors, the main body of the stroke should match well.
        if (minDistance < (30*30*3)) { // Allow some deviation (e.g. each component off by up to 30)
             return closestInstrument;
        }
        return PALETTE_INSTRUMENTS['#000000']; // Fallback if no close match
    }


    function convertDrawingToSound() {
        if (canvas.width === 0 || canvas.height === 0) {
            alert("画板没有有效尺寸，无法转换声音。");
            return;
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        const totalDuration = 6; // seconds, slightly longer
        const timeStep = width > 0 ? totalDuration / width : 0.01; 
        
        const minMidiNote = 40; // Lowered min for bass (E2)
        const maxMidiNote = 88; // Slightly higher max (E6)
        const pitchRange = maxMidiNote - minMidiNote;

        const notesToPlay = [];
        const currentLineWidthVal = parseInt(lineWidthInput.value, 10) || 5;
        const scanStep = Math.max(1, Math.floor(currentLineWidthVal / 1.5)); // Scan step related to line width

        for (let x = 0; x < width; x += scanStep) {
            for (let y = 0; y < height; y += scanStep) {
                const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                if (index + 3 >= data.length) continue;

                const r = data[index];
                const g = data[index+1];
                const b = data[index+2];
                const a = data[index+3];

                if (a > 128) { // Pixel has been drawn on (alpha is not 0 or near 0)
                    const instrument = getInstrumentFromPixelColor(r, g, b);
                    const time = x * timeStep;
                    const normalizedY = (height - y) / height; 
                    const midiNote = minMidiNote + normalizedY * pitchRange;
                    const frequency = midiToFreq(midiNote);
                    
                    let alreadyExists = notesToPlay.some(note => 
                        Math.abs(note.time - time) < (timeStep * scanStep * 0.8) &&
                        Math.abs(note.originalMidi - midiNote) < 0.5 // Very close pitch (half semitone)
                    );

                    if (!alreadyExists && frequency > 0) {
                         notesToPlay.push({ time, frequency, instrument, originalMidi: midiNote });
                    }
                }
            }
        }
        
        notesToPlay.sort((a, b) => a.time - b.time);

        if (notesToPlay.length === 0) {
            // alert("No drawing found to convert to sound."); // Optional: notify user
            return;
        }

        notesToPlay.forEach(note => {
            playNote(note.frequency, note.time, note.instrument);
        });
    }

    function midiToFreq(midi) {
        return Math.pow(2, (midi - 69) / 12) * 440;
    }

    function playNote(frequency, startTimeOffset, instrumentChoice) {
        if (!audioContext || frequency <= 0) return;

        const currentTime = audioContext.currentTime;
        const noteActualStartTime = currentTime + startTimeOffset;
        
        let oscillatorType = 'sine';
        let attackTime = 0.01, decayTime = 0.1, sustainLevel = 0.7, releaseTime = 0.2;
        let finalNoteDuration = 0.3; // Default duration

        const gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
        gainNode.gain.setValueAtTime(0, noteActualStartTime);

        switch (instrumentChoice) {
            case 'piano':
                oscillatorType = 'triangle';
                attackTime = 0.01; decayTime = 0.4; sustainLevel = 0.4; releaseTime = 0.3;
                finalNoteDuration = 0.8;
                gainNode.gain.linearRampToValueAtTime(0.8, noteActualStartTime + attackTime); 
                gainNode.gain.linearRampToValueAtTime(sustainLevel * 0.8, noteActualStartTime + attackTime + decayTime); 
                gainNode.gain.setValueAtTime(sustainLevel * 0.8, noteActualStartTime + finalNoteDuration - releaseTime);
                gainNode.gain.linearRampToValueAtTime(0, noteActualStartTime + finalNoteDuration);
                break;
            case 'musicbox':
                oscillatorType = 'square'; // Often brighter for music box
                attackTime = 0.005; decayTime = 0.3;
                finalNoteDuration = 0.005 + decayTime; 
                gainNode.gain.linearRampToValueAtTime(0.6, noteActualStartTime + attackTime); 
                gainNode.gain.exponentialRampToValueAtTime(0.001, noteActualStartTime + finalNoteDuration);
                break;
            case 'organ':
                oscillatorType = 'sawtooth';
                attackTime = 0.05; sustainLevel = 0.5; releaseTime = 0.15;
                finalNoteDuration = 0.6; 
                gainNode.gain.linearRampToValueAtTime(sustainLevel, noteActualStartTime + attackTime);
                gainNode.gain.setValueAtTime(sustainLevel, noteActualStartTime + finalNoteDuration - releaseTime);
                gainNode.gain.linearRampToValueAtTime(0, noteActualStartTime + finalNoteDuration);
                break;
            case 'synthpluck': // Yellow
                oscillatorType = 'triangle';
                attackTime = 0.005; decayTime = 0.2;
                finalNoteDuration = attackTime + decayTime + 0.05;
                gainNode.gain.linearRampToValueAtTime(0.9, noteActualStartTime + attackTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, noteActualStartTime + finalNoteDuration - 0.05);
                break;
            case 'sinebass': // Black
                oscillatorType = 'sine';
                attackTime = 0.02; sustainLevel = 0.6; releaseTime = 0.2;
                finalNoteDuration = 0.5;
                gainNode.gain.linearRampToValueAtTime(sustainLevel, noteActualStartTime + attackTime);
                gainNode.gain.setValueAtTime(sustainLevel, noteActualStartTime + finalNoteDuration - releaseTime);
                gainNode.gain.linearRampToValueAtTime(0, noteActualStartTime + finalNoteDuration);
                break;
            default: 
                oscillatorType = 'sine';
                finalNoteDuration = 0.3;
                gainNode.gain.linearRampToValueAtTime(0.5, noteActualStartTime + 0.01);
                gainNode.gain.linearRampToValueAtTime(0, noteActualStartTime + finalNoteDuration);
        }

        const oscillator = audioContext.createOscillator();
        oscillator.type = oscillatorType;
        oscillator.frequency.setValueAtTime(frequency, noteActualStartTime);

        // For some instruments, adding a slight detune or chorus can make them richer
        // Example for organ (optional):
        if (instrumentChoice === 'organ') {
            const detuneOsc = audioContext.createOscillator();
            detuneOsc.type = oscillatorType;
            detuneOsc.frequency.setValueAtTime(frequency * 1.005, noteActualStartTime); // Slightly detuned
            detuneOsc.connect(gainNode);
            detuneOsc.start(noteActualStartTime);
            detuneOsc.stop(noteActualStartTime + finalNoteDuration + 0.1);
        }

        oscillator.connect(gainNode);
        oscillator.start(noteActualStartTime);
        oscillator.stop(noteActualStartTime + finalNoteDuration + 0.1); // Add buffer
    }
});