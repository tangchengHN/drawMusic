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
    const brushOptions = document.querySelectorAll('.brush-option'); // Still need this for visual color selection

    let audioContext;
    let isDrawing = false;
    let currentBrushColor = '#E6B0AA'; // 更新默认颜色为轻柔钢琴色

    // 添加钢琴音色映射
    const PIANO_TONES = {
        '#E6B0AA': { name: 'softPiano', oscType1: 'triangle', oscType2: 'sine', mix: [0.7, 0.3], attack: 0.01, release: 0.5 },
        '#D2B4DE': { name: 'dreamyPiano', oscType1: 'sine', oscType2: 'triangle', mix: [0.8, 0.2], attack: 0.02, release: 0.8 },
        '#A9CCE3': { name: 'gentlePiano', oscType1: 'sine', oscType2: 'sine', mix: [0.9, 0.1], attack: 0.015, release: 0.6 },
        '#A2D9CE': { name: 'airyPiano', oscType1: 'triangle', oscType2: 'sine', mix: [0.6, 0.4], attack: 0.008, release: 0.7 },
        '#F9E79F': { name: 'warmPiano', oscType1: 'sine', oscType2: 'triangle', mix: [0.75, 0.25], attack: 0.012, release: 0.55 }
    };

    function setCanvasDrawingDefaults() {
        ctx.strokeStyle = currentBrushColor; // Visual color
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

    // Brush selection still visually changes the drawing color
    brushOptions.forEach(brush => {
        brush.addEventListener('click', () => {
            brushOptions.forEach(b => b.classList.remove('active'));
            brush.classList.add('active');
            currentBrushColor = brush.dataset.color; // Update current visual color
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
            // Optional: if (window.confirm("Clear canvas?")) ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    // Removed getInstrumentFromPixelColor function

    function convertDrawingToSound() {
        if (canvas.width === 0 || canvas.height === 0) {
            alert("画板没有有效尺寸，无法转换声音。");
            return;
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        const totalDuration = 7; 
        const timeStep = width > 0 ? totalDuration / width : 0.01; 
        
        const minMidiNote = 60; // C4 - 更高的起始音符，更柔和
        const maxMidiNote = 84; // C6 - 保持相同的上限
        const pitchRange = maxMidiNote - minMidiNote;

        const notesToPlay = [];
        const currentLineWidthVal = parseInt(lineWidthInput.value, 10) || 5;
        const scanStep = Math.max(2, Math.floor(currentLineWidthVal / 1.8)); // Adjust scan step

        // 用于识别颜色的辅助函数
        function getClosestPianoTone(r, g, b) {
            // 将RGB转换为HEX
            const hex = rgbToHex(r, g, b);
            
            // 找到最接近的预定义钢琴音色
            let closestColor = '#E6B0AA'; // 默认为轻柔钢琴
            let minDistance = Number.MAX_VALUE;
            
            for (const color in PIANO_TONES) {
                const distance = colorDistance(hexToRgb(color), {r, g, b});
                if (distance < minDistance) {
                    minDistance = distance;
                    closestColor = color;
                }
            }
            
            return closestColor;
        }
        
        function colorDistance(color1, color2) {
            return Math.sqrt(
                Math.pow(color1.r - color2.r, 2) +
                Math.pow(color1.g - color2.g, 2) +
                Math.pow(color1.b - color2.b, 2)
            );
        }
        
        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : {r: 0, g: 0, b: 0};
        }
        
        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }

        for (let x = 0; x < width; x += scanStep) {
            for (let y = 0; y < height; y += scanStep) {
                const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                if (index + 3 >= data.length) continue;

                const r = data[index];
                const g = data[index+1];
                const b = data[index+2];
                const a = data[index+3];

                if (a > 128) { // 像素有绘画
                    const pianoToneColor = getClosestPianoTone(r, g, b);
                    const time = x * timeStep;
                    const normalizedY = (height - y) / height; 
                    const midiNote = minMidiNote + normalizedY * pitchRange;
                    const frequency = midiToFreq(midiNote);
                    
                    let alreadyExists = notesToPlay.some(note => 
                        Math.abs(note.time - time) < (timeStep * scanStep * 0.6) && 
                        Math.abs(note.originalMidi - midiNote) < 0.5 // 非常接近的音高
                    );

                    if (!alreadyExists && frequency > 20 && frequency < audioContext.sampleRate / 2) {
                         notesToPlay.push({ 
                             time, 
                             frequency, 
                             originalMidi: midiNote,
                             pianoToneColor // 保存颜色以便选择钢琴音色
                         });
                    }
                }
            }
        }
        
        notesToPlay.sort((a, b) => a.time - b.time);

        if (notesToPlay.length === 0) {
            return;
        }

        notesToPlay.forEach(note => {
            playPianoNote(note.frequency, note.time, note.pianoToneColor); 
        });
    }

    function midiToFreq(midi) {
        return Math.pow(2, (midi - 69) / 12) * 440;
    }

    // 改进的钢琴音符函数，根据颜色选择不同的钢琴音色
    function playPianoNote(frequency, startTimeOffset, pianoToneColor = '#E6B0AA') {
        if (!audioContext || frequency <= 0) return;

        const now = audioContext.currentTime;
        const noteStartTime = now + startTimeOffset;
        
        // 获取对应的钢琴音色配置
        const toneConfig = PIANO_TONES[pianoToneColor] || PIANO_TONES['#E6B0AA'];

        // 创建振荡器
        const osc1 = audioContext.createOscillator();
        osc1.type = toneConfig.oscType1;
        osc1.frequency.setValueAtTime(frequency, noteStartTime);

        const osc2 = audioContext.createOscillator();
        osc2.type = toneConfig.oscType2;
        osc2.frequency.setValueAtTime(frequency, noteStartTime);
        osc2.detune.setValueAtTime(5, noteStartTime); // 轻微失谐，增加温暖感

        // 每个振荡器的增益控制
        const osc1Gain = audioContext.createGain();
        osc1Gain.gain.setValueAtTime(toneConfig.mix[0], noteStartTime);

        const osc2Gain = audioContext.createGain();
        osc2Gain.gain.setValueAtTime(toneConfig.mix[1], noteStartTime);

        // 滤波器 - 低通滤波器塑造音色，使其更柔和
        const filterNode = audioContext.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.Q.setValueAtTime(0.8, noteStartTime); // 降低Q值，减少共振，更柔和

        // 滤波器包络：模拟钢琴锤击和随后的柔化
        const filterInitialFreq = frequency * 2.0; // 降低初始亮度
        const filterSustainFreq = frequency * 1.0; // 更柔和的持续频率
        const filterAttackTime = 0.02;
        const filterDecayTime = 0.3;

        filterNode.frequency.setValueAtTime(filterInitialFreq * 0.7, noteStartTime); // 初始更闭合
        filterNode.frequency.linearRampToValueAtTime(filterInitialFreq, noteStartTime + filterAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(filterSustainFreq, noteStartTime + filterAttackTime + filterDecayTime);

        // 主增益节点用于整体音量包络
        const masterGain = audioContext.createGain();
        masterGain.gain.setValueAtTime(0, noteStartTime); // 开始时静音

        // 音量包络 (ADSR)
        const attackTime = toneConfig.attack; // 根据音色配置
        const decayTime = 0.35;   // 达到持续水平所需时间
        const sustainProportion = 0.3; // 持续音量比例，降低以使声音更柔和
        const releaseTime = toneConfig.release; // 根据音色配置
        const notePressDuration = 0.4; // 概念上"按键"保持的时间

        // 根据这些计算总持续时间
        const totalNoteDuration = attackTime + decayTime + notePressDuration + releaseTime;

        // 攻击：音量上升到峰值
        masterGain.gain.linearRampToValueAtTime(0.5, noteStartTime + attackTime); // 降低最大音量
        // 衰减：音量下降到持续水平
        masterGain.gain.exponentialRampToValueAtTime(0.5 * sustainProportion, noteStartTime + attackTime + decayTime);
        // 持续：保持在持续水平（隐含，值保持到下一次变化）
        // 释放：开始淡出
        masterGain.gain.setValueAtTime(0.5 * sustainProportion, noteStartTime + attackTime + decayTime + notePressDuration);
        masterGain.gain.linearRampToValueAtTime(0, noteStartTime + totalNoteDuration);

        // 添加混响效果使声音更柔和
        const convolver = audioContext.createConvolver();
        // 创建简单的混响脉冲响应
        const impulseLength = audioContext.sampleRate * 2; // 2秒混响
        const impulse = audioContext.createBuffer(2, impulseLength, audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const impulseData = impulse.getChannelData(channel);
            for (let i = 0; i < impulseLength; i++) {
                impulseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * 0.3));
            }
        }
        
        convolver.buffer = impulse;
        const reverbGain = audioContext.createGain();
        reverbGain.gain.value = 0.15; // 轻微的混响效果

        // 连接
        osc1.connect(osc1Gain);
        osc2.connect(osc2Gain);
        
        osc1Gain.connect(filterNode);
        osc2Gain.connect(filterNode);
        
        filterNode.connect(masterGain);
        filterNode.connect(convolver);
        convolver.connect(reverbGain);
        reverbGain.connect(masterGain);
        
        masterGain.connect(audioContext.destination);

        // 启动和停止振荡器
        osc1.start(noteStartTime);
        osc1.stop(noteStartTime + totalNoteDuration + 0.1);

        osc2.start(noteStartTime);
        osc2.stop(noteStartTime + totalNoteDuration + 0.1);
    }
    // --- End of script.js ---
});