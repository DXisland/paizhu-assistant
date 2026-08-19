let currentStream = null;
let facingMode = 'user';
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let animationId = null;

const video = document.getElementById('video');
const silhouetteGuide = document.getElementById('silhouette-guide');
const brightnessAlert = document.getElementById('brightness-alert');
const audioWaveform = document.getElementById('audio-waveform');
const audioStatus = document.getElementById('audio-status');
const recordBtn = document.getElementById('record-btn');
const switchCameraBtn = document.getElementById('switch-camera');

document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    initModeSelector();
    initEventListeners();
    updateSilhouetteGuide('upper');
});

async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: true
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        video.onloadedmetadata = () => {
            initAudio();
            startBrightnessCheck();
        };
    } catch (error) {
        console.error('摄像头初始化失败:', error);
        alert('无法访问摄像头，请检查权限设置');
    }
}

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(currentStream);
        source.connect(analyser);
        drawAudioWaveform();
    } catch (error) {
        console.error('音频初始化失败:', error);
    }
}

function drawAudioWaveform() {
    const canvas = audioWaveform;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        ctx.clearRect(0, 0, width, height);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        updateAudioStatus(dataArray, average);
        const barWidth = width / bufferLength * 2.5;
        let x = 0;
        const isGoodAudio = checkAudioQuality(dataArray);
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * 0.8;
            ctx.fillStyle = isGoodAudio ? '#4CAF50' : '#ff9800';
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
        }
        ctx.beginPath();
        ctx.strokeStyle = isGoodAudio ? '#4CAF50' : '#ff9800';
        ctx.lineWidth = 2;
        ctx.moveTo(0, height / 2);
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height * 0.4;
            const y = height / 2 - barHeight;
            ctx.lineTo(i * (width / bufferLength), y);
        }
        ctx.stroke();
    }
    draw();
}

function checkAudioQuality(dataArray) {
    const mean = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const squareDiffs = dataArray.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);
    return stdDev < 50;
}

function updateAudioStatus(dataArray, average) {
    const isGood = checkAudioQuality(dataArray);
    if (average < 10) {
        audioStatus.textContent = '收声效果：未检测到声音';
        audioStatus.style.color = '#ffeb3b';
    } else if (isGood) {
        audioStatus.textContent = '收声效果：良好';
        audioStatus.style.color = '#4CAF50';
    } else {
        audioStatus.textContent = '收声效果：较差，请靠近或减少噪音';
        audioStatus.style.color = '#ff9800';
    }
}

function startBrightnessCheck() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 100;
    canvas.height = 75;

    function checkBrightness() {
        if (!video.videoWidth) {
            requestAnimationFrame(checkBrightness);
            return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            totalBrightness += brightness;
        }
        const averageBrightness = totalBrightness / (data.length / 4);
        if (averageBrightness < 50) {
            showBrightnessAlert('画面过暗，请增加光线', 'too-dark');
        } else if (averageBrightness > 200) {
            showBrightnessAlert('画面过亮，请减少光线', 'too-bright');
        } else {
            hideBrightnessAlert();
        }
        requestAnimationFrame(checkBrightness);
    }
    checkBrightness();
}

function showBrightnessAlert(message, type) {
    brightnessAlert.textContent = message;
    brightnessAlert.className = 'brightness-alert ' + type;
}

function hideBrightnessAlert() {
    brightnessAlert.className = 'brightness-alert hidden';
}

function updateSilhouetteGuide(mode) {
    silhouetteGuide.setAttribute('data-mode', mode);
}

function initModeSelector() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSilhouetteGuide(btn.dataset.mode);
        });
    });
}

function initEventListeners() {
    switchCameraBtn.addEventListener('click', switchCamera);
    recordBtn.addEventListener('click', toggleRecording);
}

async function switchCamera() {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    await initCamera();
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp9' };
    try {
        mediaRecorder = new MediaRecorder(currentStream, options);
    } catch (error) {
        console.error('MediaRecorder 创建失败:', error);
        alert('您的浏览器不支持视频录制功能');
        return;
    }
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording_' + Date.now() + '.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        alert('录制完成！视频已下载');
    };
    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
    recordBtn.querySelector('.icon').textContent = '\u23F9';
    recordBtn.querySelector('span:last-child').textContent = '停止';
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('.icon').textContent = '\u25CF';
    recordBtn.querySelector('span:last-child').textContent = '录制';
}

window.addEventListener('beforeunload', () => {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
});
