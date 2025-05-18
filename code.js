document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('doodleCanvas');
    // ... (其他变量声明和函数如 getEventPosition, startDrawing, draw, stopDrawing, resizeCanvas 等保持不变) ...
    // 我将仅展示修改的核心部分，主要是 playNote 和相关的 AudioContext 使用

    // --- 从这里开始是 script.js 的开头部分，保持和你之前的一样 ---
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
        clearCanvasContent(false); 
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
            if (isDrawing) { 
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
        let closestInstrument = PALETTE_INSTRUMENTS['#000000']; 
        let minDistance = Infinity;
    
        for (const hexColor in PALETTE_INSTRUMENTS) {
            const paletteRgb = hexToRgb(hexColor);
            if (!paletteRgb) continue;
    
            const distance = Math.pow(r_pixel - paletteRgb.r, 2) +
                             Math.pow(g_pixel - paletteRgb.g, 2) +
                             Math.pow(b_pixel - paletteRgb.b, 2);
    
            if (distance < minDistance) {
                minDistance = distance;
                closestInstrument = PALETTE_INSTRUMENTS[hexColor];
            }
        }
        // More robust matching: if a pixel color is "close enough" to a palette color
        if (minDistance < (50*50*3)) { // Allow each component to be off by ~50
             return closestInstrument;
        }
        // If no color is close, perhaps default to piano or a neutral sound
        return PALETTE_INSTRUMENTS['#FF0000']; // Fallback to piano if no distinct color match
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

        const totalDuration = 7; // seconds, can be adjusted
        const timeStep = width > 0 ? totalDuration / width : 0.01; 
        
        const minMidiNote = 36; // C2 - Lower for bass
        const maxMidiNote = 96; // C7 - Higher for brighter sounds
        const pitchRange = maxMidiNote - minMidiNote;

        const notesToPlay = [];
        const currentLineWidthVal = parseInt(lineWidthInput.value, 10) || 5;
        // Adjust scanStep: make it smaller for denser note detection, larger for sparser
        const scanStep = Math.max(2, Math.floor(currentLineWidthVal / 2)); 

        for (let x = 0; x < width; x += scanStep) {
            for (let y = 0; y < height; y += scanStep) {
                const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                if (index + 3 >= data.length) continue;

                const r = data[index];
                const g = data[index+1];
                const b = data[index+2];
                const a = data[index+3];

                if (a > 128) { 
                    const instrument = getInstrumentFromPixelColor(r, g, b);
                    const time = x * timeStep;
                    const normalizedY = (height - y) / height; 
                    const midiNote = minMidiNote + normalizedY * pitchRange;
                    const frequency = midiToFreq(midiNote);
                    
                    // Deduplication: if a note of the same instrument is already very close in time and pitch
                    let alreadyExists = notesToPlay.some(note => 
                        note.instrument === instrument &&
                        Math.abs(note.time - time) < (timeStep * scanStep * 0.7) && // Time window
                        Math.abs(note.originalMidi - midiNote) < 0.75 // Pitch window (semitones)
                    );

                    if (!alreadyExists && frequency > 0 && frequency < audioContext.sampleRate / 2) { // Check Nyquist
                         notesToPlay.push({ time, frequency, instrument, originalMidi: midiNote });
                    }
                }
            }
        }
        
        notesToPlay.sort((a, b) => a.time - b.time);

        if (notesToPlay.length === 0) {
            return;
        }

        notesToPlay.forEach(note => {
            playNote(note.frequency, note.time, note.instrument);
        });
    }

    function midiToFreq(midi) {
        return Math.pow(2, (midi - 69) / 12) * 440;
    }

    // --- BEAUTIFIED playNote FUNCTION ---
    function playNote(frequency, startTimeOffset, instrumentChoice) {
        if (!audioContext || frequency <= 0) return;

        const now = audioContext.currentTime;
        const noteStartTime = now + startTimeOffset;

        let osc, osc2, gainNode, filterNode, lfo;
        let attackTime, decayTime, sustainLevel, releaseTime, noteDuration;
        let filterAttack, filterDecay, filterSustain, filterRelease, filterFreq, filterQ, filterEnvAmount;

        // Master Gain Node for this note
        const masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        masterGain.gain.setValueAtTime(0, noteStartTime); // Start silent

        switch (instrumentChoice) {
            case 'piano':
                osc = audioContext.createOscillator();
                osc.type = 'triangle'; // Softer base for piano
                osc.frequency.setValueAtTime(frequency, noteStartTime);

                // Filter for piano - make it brighter on attack, then mellower
                filterNode = audioContext.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.Q.setValueAtTime(1, noteStartTime); // Moderate Q

                filterFreq = frequency * 3; // Filter starts above fundamental
                filterEnvAmount = frequency * 6; // How much envelope opens the filter

                filterNode.frequency.setValueAtTime(filterFreq, noteStartTime);
                filterNode.frequency.linearRampToValueAtTime(filterFreq + filterEnvAmount, noteStartTime + 0.01); // Quick open
                filterNode.frequency.exponentialRampToValueAtTime(filterFreq * 0.8, noteStartTime + 0.3); // Mellow down
                filterNode.frequency.linearRampToValueAtTime(frequency * 0.5, noteStartTime + 1.0); // Slow further mellowing for release

                attackTime = 0.005; decayTime = 0.4; sustainLevel = 0.3; releaseTime = 0.5;
                noteDuration = attackTime + decayTime + releaseTime + 0.2; // Total note length

                masterGain.gain.linearRampToValueAtTime(0.7, noteStartTime + attackTime); // Main volume attack
                masterGain.gain.exponentialRampToValueAtTime(sustainLevel * 0.7, noteStartTime + attackTime + decayTime); // Decay
                masterGain.gain.setValueAtTime(sustainLevel * 0.7, noteStartTime + noteDuration - releaseTime); // Hold sustain
                masterGain.gain.linearRampToValueAtTime(0, noteStartTime + noteDuration); // Release

                osc.connect(filterNode);
                filterNode.connect(masterGain);
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.1);
                break;

            case 'musicbox':
                osc = audioContext.createOscillator();
                osc.type = 'sine'; // Pure tone for music box, less harsh than square
                osc.frequency.setValueAtTime(frequency, noteStartTime);
                // Optional: a second slightly detuned sine for shimmer
                osc2 = audioContext.createOscillator();
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(frequency * 1.005, noteStartTime); // Slight detune
                osc2.detune.setValueAtTime(5, noteStartTime); // another way to detune

                attackTime = 0.002; 
                noteDuration = 0.6; // Short, percussive

                masterGain.gain.setValueAtTime(0, noteStartTime);
                masterGain.gain.linearRampToValueAtTime(0.5, noteStartTime + attackTime); // Very sharp attack
                masterGain.gain.exponentialRampToValueAtTime(0.001, noteStartTime + noteDuration); // Fast decay

                osc.connect(masterGain);
                osc2.connect(masterGain); // Mix in the second oscillator at a lower volume
                masterGain.gain.setValueAtTime(0.25, noteStartTime); // Adjust osc2 volume relative to osc1 if needed
                
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.05);
                osc2.start(noteStartTime);
                osc2.stop(noteStartTime + noteDuration + 0.05);
                break;

            case 'organ':
                osc = audioContext.createOscillator();
                osc.type = 'sawtooth'; // Rich harmonics for organ
                osc.frequency.setValueAtTime(frequency, noteStartTime);

                osc2 = audioContext.createOscillator(); // Second oscillator for chorus effect
                osc2.type = 'sawtooth';
                osc2.frequency.setValueAtTime(frequency, noteStartTime);
                osc2.detune.setValueAtTime(8, noteStartTime); // Detune slightly (in cents)

                // LFO for vibrato/leslie-like effect
                lfo = audioContext.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.setValueAtTime(5, noteStartTime); // LFO rate 5Hz
                const lfoGain = audioContext.createGain();
                lfoGain.gain.setValueAtTime(3, noteStartTime); // LFO depth (cents for detune)
                lfo.connect(lfoGain);
                lfoGain.connect(osc.detune); // Modulate detune of the first oscillator
                lfoGain.connect(osc2.detune);

                filterNode = audioContext.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.frequency.setValueAtTime(frequency * 4, noteStartTime); // Brighter organ
                filterNode.Q.setValueAtTime(0.5, noteStartTime);

                attackTime = 0.03; sustainLevel = 0.4; releaseTime = 0.1;
                noteDuration = 0.8; // Organ notes can sustain

                masterGain.gain.linearRampToValueAtTime(sustainLevel, noteStartTime + attackTime);
                masterGain.gain.setValueAtTime(sustainLevel, noteStartTime + noteDuration - releaseTime);
                masterGain.gain.linearRampToValueAtTime(0, noteStartTime + noteDuration);

                osc.connect(filterNode);
                osc2.connect(filterNode);
                filterNode.connect(masterGain);
                
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.1);
                osc2.start(noteStartTime);
                osc2.stop(noteStartTime + noteDuration + 0.1);
                lfo.start(noteStartTime);
                lfo.stop(noteStartTime + noteDuration + 0.1);
                break;

            case 'synthpluck':
                osc = audioContext.createOscillator();
                osc.type = 'sawtooth'; // Sawtooth for a bright pluck
                osc.frequency.setValueAtTime(frequency, noteStartTime);

                filterNode = audioContext.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.Q.setValueAtTime(2, noteStartTime); // Some resonance for 'pluckiness'

                // Filter envelope - very important for pluck
                filterFreq = frequency * 1; // Start with filter somewhat closed
                filterEnvAmount = frequency * 10; // Open up significantly

                filterNode.frequency.setValueAtTime(filterFreq, noteStartTime);
                filterNode.frequency.linearRampToValueAtTime(filterFreq + filterEnvAmount, noteStartTime + 0.01); // Quick open
                filterNode.frequency.exponentialRampToValueAtTime(filterFreq * 0.5, noteStartTime + 0.15); // Quick close

                attackTime = 0.002; noteDuration = 0.3;
                
                masterGain.gain.linearRampToValueAtTime(0.6, noteStartTime + attackTime);
                masterGain.gain.exponentialRampToValueAtTime(0.001, noteStartTime + noteDuration);

                osc.connect(filterNode);
                filterNode.connect(masterGain);
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.05);
                break;

            case 'sinebass':
                osc = audioContext.createOscillator();
                osc.type = 'sine'; // Pure sine for clean bass
                osc.frequency.setValueAtTime(frequency, noteStartTime);

                // Optional: slight saturation for warmth if desired (can be complex)
                // For now, keep it clean.

                attackTime = 0.01; sustainLevel = 0.5; releaseTime = 0.2;
                noteDuration = 0.5;

                masterGain.gain.linearRampToValueAtTime(sustainLevel, noteStartTime + attackTime);
                masterGain.gain.setValueAtTime(sustainLevel, noteStartTime + noteDuration - releaseTime);
                masterGain.gain.linearRampToValueAtTime(0, noteStartTime + noteDuration);

                osc.connect(masterGain);
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.1);
                break;

            default: // Fallback
                osc = audioContext.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency, noteStartTime);
                noteDuration = 0.3;
                masterGain.gain.linearRampToValueAtTime(0.5, noteStartTime + 0.01);
                masterGain.gain.linearRampToValueAtTime(0, noteStartTime + noteDuration);
                osc.connect(masterGain);
                osc.start(noteStartTime);
                osc.stop(noteStartTime + noteDuration + 0.05);
        }
    }
    // --- script.js 的其余部分（如果还有的话）保持不变 ---
});