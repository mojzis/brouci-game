
/* Setting up the constraint */
var facingMode = "environment"; // Can be 'user' or 'environment' to access back or front camera (NEAT!)
var constraints = {
    audio: false,
    video: {
        facingMode: facingMode
    }
};

// Pose detection variables
let detector = null;
let lastPoseTime = 0;
const POSE_DETECTION_INTERVAL = 100; // Run pose detection every 100ms

// Track current camera
let currentStream = null;
let cameras = [];
let currentCameraIndex = 0;

// Global poses array for debugging - moved to window object for easier access
window.poses = [];

// Shake detection variables
let lastShakeTime = 0;
const shakeThreshold = 15;

// Global animals array for debugging and tweaking
let animals = [];

// Game state variables
let gameState = 'playing'; // 'playing', 'caught', 'menu'
let score = 0;
let gameStartTime = Date.now();
let catchStartTime = null;
let isCaught = false;
let respawnTimer = null;
let catchTimeRequired = 500; // milliseconds, configurable

// Pose visualization variables
let showPoses = false;
let poseCanvas = null;
let poseCtx = null;


function startVideoStream() {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia is not supported in this browser or context');
        // Only show error if we're not on localhost or HTTPS
        if (window.location.protocol === 'file:') {
            document.getElementById('cameraError').style.display = 'block';
        }
        return;
    }
    
    // Stop any existing stream
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    navigator.mediaDevices.getUserMedia(constraints)
        .then(function success(stream) {
            currentStream = stream;
            const video = document.getElementById('video');
            video.srcObject = stream;
            // Initialize pose detection after video stream is ready
            video.addEventListener('loadeddata', () => {
                initializePoseDetection();
            });
        })
        .catch(function(error) {
            console.error('Error accessing camera:', error);
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            
            const errorEl = document.getElementById('cameraError');
            
            if (error.name === 'NotReadableError') {
                errorEl.innerHTML = `<strong>Camera is in use or not available.</strong><br>
                    Please try:<br>
                    • Close other apps using the camera (Zoom, Teams, etc.)<br>
                    • Unplug and reconnect the USB camera<br>
                    • Try the built-in camera first`;
                errorEl.style.display = 'block';
                
                // Try to fall back to built-in camera
                setTimeout(() => {
                    console.log('Attempting to use built-in camera...');
                    constraints.video = true; // Use default camera
                    startVideoStream();
                }, 2000);
            } else if (window.location.protocol === 'file:') {
                errorEl.style.display = 'block';
            } else {
                errorEl.textContent = `Camera error: ${error.message}. Please check camera permissions.`;
                errorEl.style.display = 'block';
            }
        });
}

async function initializePoseDetection() {
    try {
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true,
            minPoseScore: 0.25
        };
        
        detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
        
        console.log('Pose detector initialized');
    } catch (error) {
        console.error('Failed to initialize pose detection:', error);
    }
}
function requestMotionPermission() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleDeviceMotion);
                    window.addEventListener('deviceorientation', handleDeviceOrientation);
                }
            })
            .catch(console.error);
    } else {
        // Handle regular non-iOS 13+ devices
        window.addEventListener('devicemotion', handleDeviceMotion);
        window.addEventListener('deviceorientation', handleDeviceOrientation);
    }
}

function handleDeviceMotion(event) {
    const acceleration = event.accelerationIncludingGravity;
    const currentTime = new Date().getTime();

    if (currentTime - lastShakeTime > 1000) { // 1 second cooldown between shakes
        const shakeMagnitude = Math.sqrt(acceleration.x * acceleration.x + acceleration.y * acceleration.y + acceleration.z * acceleration.z);

        if (shakeMagnitude > shakeThreshold) {
            lastShakeTime = currentTime;
            resetAnimalPositions();
        }
    }
}

function handleDeviceOrientation(event) {
    tiltX = event.gamma; // left/right tilt in degrees
    tiltY = event.beta; // front/back tilt in degrees
}

// Skeleton connections for MoveNet
const SKELETON_CONNECTIONS = [
    ['nose', 'left_eye'],
    ['nose', 'right_eye'],
    ['left_eye', 'left_ear'],
    ['right_eye', 'right_ear'],
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle']
];

function drawKeypoint(ctx, keypoint, isTouching = false) {
    if (keypoint.score < 0.3) return;
    
    ctx.beginPath();
    ctx.arc(keypoint.x, keypoint.y, isTouching ? 8 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = isTouching ? '#ff0000' : (keypoint.score > 0.5 ? '#00ff00' : '#ffff00');
    ctx.fill();
    ctx.strokeStyle = isTouching ? '#ff0000' : '#000000';
    ctx.lineWidth = isTouching ? 3 : 1;
    ctx.stroke();
}

function drawSkeleton(ctx, keypoints) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    
    SKELETON_CONNECTIONS.forEach(([start, end]) => {
        const startPoint = keypoints.find(kp => kp.name === start);
        const endPoint = keypoints.find(kp => kp.name === end);
        
        if (startPoint && endPoint && startPoint.score > 0.3 && endPoint.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
        }
    });
}

function drawPoses() {
    if (!showPoses || !poseCanvas || !poseCtx || !window.poses) return;
    
    // Clear canvas
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    
    // Get touching hands from animals
    const touchingHands = [];
    animals.forEach(animal => {
        if (animal.touchingHand && animal.touchingHand.keypoint) {
            touchingHands.push(animal.touchingHand.keypoint);
        }
    });
    
    // Draw each pose
    window.poses.forEach(pose => {
        if (pose.score < 0.3) return;
        
        // Draw skeleton connections first
        drawSkeleton(poseCtx, pose.keypoints);
        
        // Draw keypoints on top
        pose.keypoints.forEach(keypoint => {
            // Check if this keypoint is a touching wrist
            const isTouching = (keypoint.name === 'left_wrist' || keypoint.name === 'right_wrist') &&
                              touchingHands.some(hand => hand.name === keypoint.name);
            drawKeypoint(poseCtx, keypoint, isTouching);
            
            // Draw catch area circle around wrists
            if (keypoint.name === 'left_wrist' || keypoint.name === 'right_wrist') {
                if (keypoint.score > 0.3) {
                    poseCtx.beginPath();
                    poseCtx.arc(keypoint.x, keypoint.y, 60, 0, 2 * Math.PI); // 60px catch radius
                    poseCtx.strokeStyle = isTouching ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.3)';
                    poseCtx.lineWidth = 2;
                    poseCtx.setLineDash([5, 5]);
                    poseCtx.stroke();
                    poseCtx.setLineDash([]); // Reset line dash
                }
            }
        });
        
        // Draw pose score
        poseCtx.fillStyle = '#00ff00';
        poseCtx.font = '16px Arial';
        poseCtx.fillText(`Score: ${pose.score.toFixed(2)}`, 10, 30);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('video');
    const toggleCameraButton = document.getElementById('toggleCameraButton');
    const togglePoseButton = document.getElementById('togglePoseButton');
    
    // Initialize pose canvas
    poseCanvas = document.getElementById('poseCanvas');
    poseCtx = poseCanvas.getContext('2d');
    
    // Set canvas size to match video
    video.addEventListener('loadedmetadata', () => {
        poseCanvas.width = video.videoWidth;
        poseCanvas.height = video.videoHeight;
        // Adjust canvas position and size when video loads
        const resizeCanvas = () => {
            poseCanvas.style.width = video.offsetWidth + 'px';
            poseCanvas.style.height = video.offsetHeight + 'px';
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    });
    
    // Toggle pose visualization
    togglePoseButton.addEventListener('click', function() {
        showPoses = !showPoses;
        this.textContent = showPoses ? 'Hide Poses' : 'Show Poses';
        this.style.backgroundColor = showPoses ? '#90EE90' : '#fff';
        if (!showPoses) {
            poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
        }
    });
    
    // Initialize with single beetle for game
    animals = [
        {
            id: 'big_brouk',
            element: null,
            x: video.offsetLeft + video.offsetWidth / 2,
            y: video.offsetTop + video.offsetHeight / 2,
            direction: Math.random() * 2 * Math.PI,
            size: 30, // Smaller size (was 55)
            growing: true,
            directionChanges: 0,
            speed: 3.0, // Much faster base speed (was 1.5)
            randomness: 0.5, // More erratic movement
            size_change: 0.8, // Less size variation
            rotateEvery: 3,
            reactionSpeed: 0.15, // Faster reaction to movement
            movementPattern: { type: 'oscillation', amplitude: 2, frequency: 0.08 },
            escapeSpeed: 6.5, // Much faster escape speed (was 3.5)
            avoidanceRadius: 200, // Larger detection radius (was 150)
            panicRadius: 100, // Larger panic radius (was 80)
            visible: true
        }
    ];
    
    // Hide other animals for single-animal game
    document.getElementById('brouk_medium').style.display = 'none';
    document.getElementById('small_brouk').style.display = 'none';

    animals.forEach(animal => {
        animal.element = document.getElementById(animal.id);
        animal.element.style.left = animal.x + 'px';
        animal.element.style.top = animal.y + 'px';
    });
    // Get list of cameras on startup
    navigator.mediaDevices.enumerateDevices().then(devices => {
        cameras = devices.filter(device => device.kind === 'videoinput');
        if (cameras.length > 1) {
            toggleCameraButton.textContent = `Camera: ${cameras[0].label || 'Camera 1'}`;
        }
    });
    
    toggleCameraButton.addEventListener('click', async function () {
        if (cameras.length <= 1) {
            alert('Only one camera detected');
            return;
        }
        
        currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
        const selectedCamera = cameras[currentCameraIndex];
        
        constraints.video = {
            deviceId: { exact: selectedCamera.deviceId }
        };
        
        this.textContent = `Camera: ${selectedCamera.label || `Camera ${currentCameraIndex + 1}`}`;
        startVideoStream();
    });
    startVideoStream();
    requestMotionPermission();
    let tiltX = 0;
    let tiltY = 0;

    function updateDirection(animal) {
        animal.direction += (Math.random() - 0.5) * animal.randomness;
        animal.direction += animal.reactionSpeed * (tiltX / 90); // adjust direction based on tilt
    }

    function updatePositionOld(animal) {
        animal.x += animal.speed * Math.cos(animal.direction);
        animal.y += animal.speed * Math.sin(animal.direction);

        if (animal.x <= video.offsetLeft || animal.x >= video.offsetLeft + video.offsetWidth - animal.element.offsetWidth ||
            animal.y <= video.offsetTop || animal.y >= video.offsetTop + video.offsetHeight - animal.element.offsetHeight) {
            animal.direction = Math.random() * 2 * Math.PI;
            animal.growing = !animal.growing;
            animal.directionChanges++;
        }

        animal.x = Math.max(video.offsetLeft, Math.min(animal.x, video.offsetLeft + video.offsetWidth - animal.element.offsetWidth));
        animal.y = Math.max(video.offsetTop, Math.min(animal.y, video.offsetTop + video.offsetHeight - animal.element.offsetHeight));

        animal.element.style.left = animal.x + 'px';
        animal.element.style.top = animal.y + 'px';
    }
    function updatePosition(animal) {
        // Base movement (from updatePositionOld)
        animal.x += animal.speed * Math.cos(animal.direction);
        animal.y += animal.speed * Math.sin(animal.direction);

        if (animal.x <= video.offsetLeft || animal.x >= video.offsetLeft + video.offsetWidth - animal.element.offsetWidth ||
            animal.y <= video.offsetTop || animal.y >= video.offsetTop + video.offsetHeight - animal.element.offsetHeight) {
            animal.direction = Math.random() * 2 * Math.PI;
            animal.growing = !animal.growing;
            animal.directionChanges++;
        }

        // Apply movement pattern (but not when escaping from a person)
        const pattern = animal.movementPattern;
        if (pattern && !animal.escaping) {
            const time = performance.now() / 1000; // Time in seconds

            if (pattern.type === 'oscillation') {
                // Oscillate along the direction of movement
                const freq = pattern.frequency || 0.05;
                const amp = pattern.amplitude || 1;
                animal.x += Math.sin(time * freq) * amp;
                animal.y += Math.cos(time * freq) * amp;
            } else if (pattern.type === 'jitter') {
                // Random jitter around the current position
                animal.x += (Math.random() - 0.05) * pattern.intensity;
                animal.y += (Math.random() - 0.05) * pattern.intensity;
            } else if (pattern.type === 'loop') {
                // Circular looping movement
                animal.x += Math.cos(time * pattern.speed) * pattern.radius;
                animal.y += Math.sin(time * pattern.speed) * pattern.radius;
            } else if (pattern.type === 'jump') {
                // Jumping movement
                if (!animal.lastJumpTime || time - animal.lastJumpTime > pattern.jumpInterval) {
                    animal.lastJumpTime = time; // Update the last jump time
                    const jumpAngle = Math.random() * 2 * Math.PI; // Random jump direction
                    animal.x += Math.cos(jumpAngle) * pattern.jumpDistance;
                    animal.y += Math.sin(jumpAngle) * pattern.jumpDistance;
                }
            }
        }

        // Check for NaN and reset if needed
        if (isNaN(animal.x) || isNaN(animal.y)) {
            console.warn(`NaN detected for ${animal.id}, resetting position`);
            animal.x = video.offsetLeft + Math.random() * (video.offsetWidth - animal.element.offsetWidth);
            animal.y = video.offsetTop + Math.random() * (video.offsetHeight - animal.element.offsetHeight);
        }
        
        // Keep the animal within bounds
        animal.x = Math.max(video.offsetLeft, Math.min(animal.x, video.offsetLeft + video.offsetWidth - animal.element.offsetWidth));
        animal.y = Math.max(video.offsetTop, Math.min(animal.y, video.offsetTop + video.offsetHeight - animal.element.offsetHeight));

        // Update the animal's position
        animal.element.style.left = animal.x + 'px';
        animal.element.style.top = animal.y + 'px';
    }
    function updateSize(animal) {
        const centerX = video.offsetLeft + video.offsetWidth / 2;
        const centerY = video.offsetTop + video.offsetHeight / 2;

        // Calculate the distance from the center of the video
        const distanceFromCenter = Math.sqrt(
            Math.pow(animal.x + animal.element.offsetWidth / 2 - centerX, 2) +
            Math.pow(animal.y + animal.element.offsetHeight / 2 - centerY, 2)
        );

        // Calculate the maximum possible distance (diagonal of the video)
        const maxDistance = Math.sqrt(
            Math.pow(video.offsetWidth / 2, 2) + Math.pow(video.offsetHeight / 2, 2)
        );

        // Scale the size based on the distance (closer to center = larger size)
        const sizeFactor = 1 - distanceFromCenter / maxDistance; // Scale between 0 and 1
        const newSize = 50 + sizeFactor * (80 * animal.size_change); // Base size is 50px, scaled by size_change

        animal.size = newSize;
        animal.element.style.width = animal.size + 'px';
        animal.element.style.height = animal.size + 'px';
    }

    function rotateAnimal(animal) {
        if (animal.directionChanges % animal.rotateEvery === 0) {
            animal.element.style.transform = `rotate(${animal.direction * (180 / Math.PI)}deg)`;
        }
    }
    function checkEdgeAndTeleport(animal) {
        const videoLeft = video.offsetLeft;
        const videoRight = video.offsetLeft + video.offsetWidth;
        const videoTop = video.offsetTop;
        const videoBottom = video.offsetTop + video.offsetHeight;

        // Check if the animal is near the edges
        if (animal.x <= videoLeft || animal.x >= videoRight - animal.element.offsetWidth ||
            animal.y <= videoTop || animal.y >= videoBottom - animal.element.offsetHeight) {

            // Randomly decide if the animal should disappear
            const shouldDisappear = Math.random() < 0.2; // 20% chance to disappear

            if (shouldDisappear) {
                // Temporarily hide the animal
                animal.element.style.display = 'none';

                // Teleport the animal to the opposite side
                if (animal.x <= videoLeft) {
                    animal.x = videoRight - animal.element.offsetWidth;
                } else if (animal.x >= videoRight - animal.element.offsetWidth) {
                    animal.x = videoLeft;
                }

                if (animal.y <= videoTop) {
                    animal.y = videoBottom - animal.element.offsetHeight;
                } else if (animal.y >= videoBottom - animal.element.offsetHeight) {
                    animal.y = videoTop;
                }

                // Update the position and make the animal visible again after a longer delay
                setTimeout(() => {
                    animal.element.style.left = animal.x + 'px';
                    animal.element.style.top = animal.y + 'px';
                    animal.element.style.display = 'block';
                }, 10000);
            } else {
                // Teleport without disappearing
                if (animal.x <= videoLeft) {
                    animal.x = videoRight - animal.element.offsetWidth;
                } else if (animal.x >= videoRight - animal.element.offsetWidth) {
                    animal.x = videoLeft;
                }

                if (animal.y <= videoTop) {
                    animal.y = videoBottom - animal.element.offsetHeight;
                } else if (animal.y >= videoBottom - animal.element.offsetHeight) {
                    animal.y = videoTop;
                }

                // Update the position immediately
                animal.element.style.left = animal.x + 'px';
                animal.element.style.top = animal.y + 'px';
            }
        }
    }
    function avoidCollision() {
        for (let i = 0; i < animals.length; i++) {
            // Skip collision detection for animals that are actively tracking
            if (animals[i].isCurrentlyTracking) continue;
            
            for (let j = i + 1; j < animals.length; j++) {
                // Skip if the other animal is tracking
                if (animals[j].isCurrentlyTracking) continue;
                
                const dx = animals[i].x - animals[j].x;
                const dy = animals[i].y - animals[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Use average size for collision detection
                const avgSize = (animals[i].size + animals[j].size) / 2;
                const minDistance = avgSize * 0.8; // Slightly smaller to prevent entanglement

                if (distance < minDistance && distance > 0) { // Collision detected
                    // Calculate separation force
                    const overlap = minDistance - distance;
                    const separationForce = Math.min(overlap * 0.3, 3); // Limit the force
                    
                    const angle = Math.atan2(dy, dx);
                    
                    // Apply separation with damping to prevent jittering
                    animals[i].x += Math.cos(angle) * separationForce;
                    animals[i].y += Math.sin(angle) * separationForce;
                    animals[j].x -= Math.cos(angle) * separationForce;
                    animals[j].y -= Math.sin(angle) * separationForce;
                    
                    // Smoothly adjust directions instead of random changes
                    const directionChange = 0.5; // Radians
                    animals[i].direction = angle + directionChange;
                    animals[j].direction = angle + Math.PI - directionChange;
                }
            }
        }
    }
    function resetAnimalPositions() {
        const corners = [
            { x: 0, y: 0 },
            { x: video.offsetWidth - 50, y: 0 },
            { x: 0, y: video.offsetHeight - 50 },
            { x: video.offsetWidth - 50, y: video.offsetHeight - 50 }
        ];

        animals.forEach((animal, index) => {
            const corner = corners[index % corners.length];
            animal.x = video.offsetLeft + corner.x;
            animal.y = video.offsetTop + corner.y;
            animal.element.style.left = animal.x + 'px';
            animal.element.style.top = animal.y + 'px';
            animal.direction = Math.random() * 2 * Math.PI;
        });
    }

    window.addEventListener('devicemotion', function (event) {
        const acceleration = event.accelerationIncludingGravity;
        const currentTime = new Date().getTime();

        if (currentTime - lastShakeTime > 1000) { // 1 second cooldown between shakes
            const shakeMagnitude = Math.sqrt(acceleration.x * acceleration.x + acceleration.y * acceleration.y + acceleration.z * acceleration.z);

            if (shakeMagnitude > shakeThreshold) {
                lastShakeTime = currentTime;
                resetAnimalPositions();
            }
        }
    });

    async function detectPoses() {
        if (!detector) return;
        
        const currentTime = performance.now();
        if (currentTime - lastPoseTime < POSE_DETECTION_INTERVAL) return;
        
        lastPoseTime = currentTime;
        
        try {
            const video = document.getElementById('video');
            window.poses = await detector.estimatePoses(video);
            // console.log('Detected poses:', window.poses);
        } catch (error) {
            console.error('Pose detection error:', error);
        }
    }

    function avoidPeople(animal) {
        if (!window.poses || window.poses.length === 0 || !animal.visible) return;
        
        // Game mode: actively avoid hands instead of tracking
        const avoidanceRadius = animal.avoidanceRadius || 150;
        const panicRadius = animal.panicRadius || 80;
        let closestHand = null;
        let closestDistance = Infinity;
        
        // Find the closest hand
        window.poses.forEach(pose => {
            if (pose.score < 0.3) return;
            
            const leftWrist = pose.keypoints.find(kp => kp.name === 'left_wrist');
            const rightWrist = pose.keypoints.find(kp => kp.name === 'right_wrist');
            
            [leftWrist, rightWrist].forEach(wrist => {
                if (wrist && wrist.score > 0.3) {
                    const scaleX = video.offsetWidth / video.videoWidth;
                    const scaleY = video.offsetHeight / video.videoHeight;
                    
                    const handX = (wrist.x * scaleX) + video.offsetLeft;
                    const handY = (wrist.y * scaleY) + video.offsetTop;
                    
                    // Animal position: x,y is top-left corner, so we calculate center
                    const animalCenterX = animal.x + animal.element.offsetWidth / 2;
                    const animalCenterY = animal.y + animal.element.offsetHeight / 2;
                    
                    const distance = Math.sqrt(
                        Math.pow(handX - animalCenterX, 2) + 
                        Math.pow(handY - animalCenterY, 2)
                    );
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestHand = { x: handX, y: handY, keypoint: wrist };
                    }
                }
            });
        });
        
        // If hand is within avoidance radius, flee!
        if (closestHand && closestDistance < avoidanceRadius) {
            const animalCenterX = animal.x + animal.element.offsetWidth / 2;
            const animalCenterY = animal.y + animal.element.offsetHeight / 2;
            
            // Calculate escape direction (away from hand)
            const dx = animalCenterX - closestHand.x;
            const dy = animalCenterY - closestHand.y;
            const escapeAngle = Math.atan2(dy, dx);
            
            // Check for catching overlap (larger catch zone)
            const catchRadius = 60; // Bigger catch area (was 35)
            if (closestDistance < catchRadius) {
                if (!catchStartTime) {
                    catchStartTime = Date.now();
                } else if (Date.now() - catchStartTime > catchTimeRequired) { // Configurable catch time
                    handleCatch(animal);
                    return;
                }
            } else {
                catchStartTime = null; // Reset catch timer if hand moves away
            }
            
            // Disabled panic mode - just normal escape
            animal.direction = escapeAngle;
            animal.speed = animal.escapeSpeed;
            
            // Store the touching hand for visual feedback
            if (closestDistance < catchRadius) {
                animal.touchingHand = closestHand;
                // Add visual feedback on beetle
                animal.element.style.filter = 'hue-rotate(300deg) brightness(1.5)'; // Reddish tint
                animal.element.style.boxShadow = '0 0 20px red';
            } else {
                animal.touchingHand = null;
                animal.element.style.filter = '';
                animal.element.style.boxShadow = '';
            }
            
            // Apply movement
            animal.x += animal.speed * Math.cos(animal.direction);
            animal.y += animal.speed * Math.sin(animal.direction);
            
            animal.escaping = true;
        } else {
            // No hands nearby, return to normal speed
            if (animal.escaping) {
                animal.speed = 3.0; // Reset to base speed (updated for new faster speed)
                animal.escaping = false;
            }
            catchStartTime = null; // Reset catch timer
            animal.touchingHand = null; // Clear touching hand
            animal.element.style.filter = ''; // Clear visual effects
            animal.element.style.boxShadow = '';
        }
        
        // Skip the old tracking behavior code
        return;
        
        // Old tracking code below (disabled)
        /*
        if (animal.trackingBehavior && window.poses.length > 0) {
            const pose = window.poses[0]; // Use the first detected pose
            
            if (animal.trackingBehavior.type === 'nose') {
                const noseKeypoint = pose.keypoints.find(kp => kp.name === 'nose');
                
                if (noseKeypoint && noseKeypoint.score > 0.3) {
                    // Convert keypoint coordinates to video element coordinates
                    const scaleX = video.offsetWidth / video.videoWidth;
                    const scaleY = video.offsetHeight / video.videoHeight;
                    
                    // Calculate relative offset based on video size
                    const relativeOffsetX = (animal.trackingBehavior.offset.x / 100) * video.offsetWidth;
                    const relativeOffsetY = (animal.trackingBehavior.offset.y / 100) * video.offsetHeight;
                    
                    // Target position with offset, scaled to match video display size
                    const targetX = (noseKeypoint.x * scaleX) + video.offsetLeft - animal.element.offsetWidth / 2 + relativeOffsetX;
                    const targetY = (noseKeypoint.y * scaleY) + video.offsetTop + relativeOffsetY;
                    
                    // Smoothly move towards the target position
                    const moveSpeed = 0.15; // How quickly to follow (0-1)
                    animal.x += (targetX - animal.x) * moveSpeed;
                    animal.y += (targetY - animal.y) * moveSpeed;
                    
                    // Update DOM position
                    animal.element.style.left = animal.x + 'px';
                    animal.element.style.top = animal.y + 'px';
                    
                    // Override normal movement for this animal
                    return;
                }
            } else if (animal.trackingBehavior.type === 'raised_palm') {
                // Check if palm is raised (wrist above elbow)
                const leftWrist = pose.keypoints.find(kp => kp.name === 'left_wrist');
                const leftElbow = pose.keypoints.find(kp => kp.name === 'left_elbow');
                const rightWrist = pose.keypoints.find(kp => kp.name === 'right_wrist');
                const rightElbow = pose.keypoints.find(kp => kp.name === 'right_elbow');
                
                let targetWrist = null;
                
                // Check left hand
                if (leftWrist && leftElbow && leftWrist.score > 0.3 && leftElbow.score > 0.3) {
                    if (leftWrist.y <= leftElbow.y) { // Wrist is at or above elbow
                        targetWrist = leftWrist;
                    }
                }
                
                // Check right hand (prefer if both are raised)
                if (rightWrist && rightElbow && rightWrist.score > 0.3 && rightElbow.score > 0.3) {
                    if (rightWrist.y <= rightElbow.y) { // Wrist is at or above elbow
                        targetWrist = rightWrist;
                    }
                }
                
                if (targetWrist) {
                    // Convert keypoint coordinates to video element coordinates
                    const scaleX = video.offsetWidth / video.videoWidth;
                    const scaleY = video.offsetHeight / video.videoHeight;
                    
                    // Calculate relative offset based on video size
                    const relativeOffsetX = (animal.trackingBehavior.offset.x / 100) * video.offsetWidth;
                    const relativeOffsetY = (animal.trackingBehavior.offset.y / 100) * video.offsetHeight;
                    
                    // Target position at the palm/wrist with offset, scaled to match video display size
                    const targetX = (targetWrist.x * scaleX) + video.offsetLeft - animal.element.offsetWidth / 2 + relativeOffsetX;
                    const targetY = (targetWrist.y * scaleY) + video.offsetTop - animal.element.offsetHeight / 2 + relativeOffsetY;
                    
                    // Smoothly move towards the target position
                    const moveSpeed = 0.2; // Slightly faster for hand tracking
                    animal.x += (targetX - animal.x) * moveSpeed;
                    animal.y += (targetY - animal.y) * moveSpeed;
                    
                    // Update DOM position
                    animal.element.style.left = animal.x + 'px';
                    animal.element.style.top = animal.y + 'px';
                    
                    // Override normal movement for this animal
                    return;
                }
            }
        }
        */
        
        // Old avoidance code below (also disabled)
        /*
        const avoidanceMargin = 50; // Pixels to add around the bounding box
        const repulsionStrength = 8; // How strongly to push away
        
        window.poses.forEach(pose => {
            if (pose.score < 0.3) return; // Skip low confidence poses
            
            // Calculate bounding box around all keypoints
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            let validPoints = 0;
            
            // Get video scaling factors
            const scaleX = video.offsetWidth / video.videoWidth;
            const scaleY = video.offsetHeight / video.videoHeight;
            
            // Find the bounds of all keypoints
            pose.keypoints.forEach(keypoint => {
                if (keypoint.score > 0.2) { // Lower threshold to include more points
                    const scaledX = keypoint.x * scaleX + video.offsetLeft;
                    const scaledY = keypoint.y * scaleY + video.offsetTop;
                    minX = Math.min(minX, scaledX);
                    minY = Math.min(minY, scaledY);
                    maxX = Math.max(maxX, scaledX);
                    maxY = Math.max(maxY, scaledY);
                    validPoints++;
                }
            });
            
            if (validPoints > 0) {
                // Expand the bounding box by the avoidance margin
                minX -= avoidanceMargin;
                minY -= avoidanceMargin;
                maxX += avoidanceMargin;
                maxY += avoidanceMargin;
                
                // Get animal center position
                const animalCenterX = animal.x + animal.element.offsetWidth / 2;
                const animalCenterY = animal.y + animal.element.offsetHeight / 2;
                
                // Check if animal is inside or near the bounding box
                if (animalCenterX >= minX && animalCenterX <= maxX && 
                    animalCenterY >= minY && animalCenterY <= maxY) {
                    
                    // Calculate the center of the bounding box
                    const boxCenterX = (minX + maxX) / 2;
                    const boxCenterY = (minY + maxY) / 2;
                    
                    // Calculate repulsion direction from box center
                    const dx = animalCenterX - boxCenterX;
                    const dy = animalCenterY - boxCenterY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // Prevent division by zero and handle center position
                    if (distance < 1) {
                        // If animal is at center, push in a random direction
                        const randomAngle = Math.random() * 2 * Math.PI;
                        animal.x += Math.cos(randomAngle) * repulsionStrength;
                        animal.y += Math.sin(randomAngle) * repulsionStrength;
                        animal.direction = randomAngle;
                    } else {
                        const angle = Math.atan2(dy, dx);
                        
                        // Calculate distance to nearest edge of the box
                        const distToLeft = animalCenterX - minX;
                        const distToRight = maxX - animalCenterX;
                        const distToTop = animalCenterY - minY;
                        const distToBottom = maxY - animalCenterY;
                        const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
                        
                        // Use a minimum push force to ensure movement
                        const pushForce = Math.max(repulsionStrength * 0.5, repulsionStrength * (1 - minEdgeDist / avoidanceMargin));
                        
                        // Apply repulsion force
                        animal.x += Math.cos(angle) * pushForce;
                        animal.y += Math.sin(angle) * pushForce;
                        
                        // Set direction consistently away from center
                        animal.direction = angle;
                        
                        // Temporarily increase speed to escape
                        animal.escaping = true;
                        animal.originalSpeed = animal.originalSpeed || animal.speed;
                        animal.speed = animal.originalSpeed * 2;
                    }
                } else if (animal.escaping) {
                    // Reset speed when outside bounding box
                    animal.speed = animal.originalSpeed || animal.speed;
                    animal.escaping = false;
                }
            }
        });
        */
    }

    function animateAnimals() {
        detectPoses(); // Run pose detection
        
        animals.forEach(animal => {
            // Check if animal is actively tracking something
            let isTracking = false;
            
            if (animal.trackingBehavior && window.poses.length > 0) {
                const pose = window.poses[0];
                
                if (animal.trackingBehavior.type === 'nose') {
                    const noseKeypoint = pose.keypoints.find(kp => kp.name === 'nose');
                    isTracking = noseKeypoint && noseKeypoint.score > 0.3;
                } else if (animal.trackingBehavior.type === 'raised_palm') {
                    // Check both hands for raised palm
                    const leftWrist = pose.keypoints.find(kp => kp.name === 'left_wrist');
                    const leftElbow = pose.keypoints.find(kp => kp.name === 'left_elbow');
                    const rightWrist = pose.keypoints.find(kp => kp.name === 'right_wrist');
                    const rightElbow = pose.keypoints.find(kp => kp.name === 'right_elbow');
                    
                    const leftRaised = leftWrist && leftElbow && leftWrist.score > 0.3 && 
                                      leftElbow.score > 0.3 && leftWrist.y <= leftElbow.y;
                    const rightRaised = rightWrist && rightElbow && rightWrist.score > 0.3 && 
                                       rightElbow.score > 0.3 && rightWrist.y <= rightElbow.y;
                    
                    isTracking = leftRaised || rightRaised;
                }
            }
            
            // Store tracking state for collision avoidance
            animal.isCurrentlyTracking = isTracking;
            
            if (!isTracking) {
                updateDirection(animal);
            }
            
            avoidPeople(animal); // Make animals avoid detected people or track specific body parts
            
            if (!isTracking) {
                updatePosition(animal);
            }
            
            updateSize(animal);
            rotateAnimal(animal);
            
            if (!isTracking) {
                checkEdgeAndTeleport(animal); // Check and teleport if near the edge
            }
        });

        avoidCollision();
        
        // Draw poses if enabled
        drawPoses();

        // if (Math.random() < 0.01) {
        //     const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
        //     randomAnimal.element.style.display = randomAnimal.element.style.display === 'none' ? 'block' : 'none';
        // }

        requestAnimationFrame(animateAnimals);
    }

    // Initialize score display
    updateScoreDisplay();
    
    // Set up control sliders
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const catchTimeSlider = document.getElementById('catchTimeSlider');
    const catchTimeValue = document.getElementById('catchTimeValue');
    const catchTimeDisplay = document.getElementById('catchTimeDisplay');
    
    speedSlider.addEventListener('input', function() {
        const speed = parseFloat(this.value);
        speedValue.textContent = speed.toFixed(1);
        animals.forEach(animal => {
            animal.speed = speed;
            animal.escapeSpeed = speed * 2.2; // Keep escape speed proportional
        });
    });
    
    catchTimeSlider.addEventListener('input', function() {
        const time = parseFloat(this.value);
        catchTimeValue.textContent = time.toFixed(1);
        catchTimeDisplay.textContent = time.toFixed(1);
        catchTimeRequired = time * 1000; // Convert to milliseconds
    });
    
    // Try to use external camera by default (index 1)
    setTimeout(() => {
        if (cameras.length > 1) {
            currentCameraIndex = 1;
            const selectedCamera = cameras[currentCameraIndex];
            constraints.video = {
                deviceId: { exact: selectedCamera.deviceId }
            };
            toggleCameraButton.textContent = `Camera: ${selectedCamera.label || 'Camera 2'}`;
            startVideoStream();
        }
    }, 1000);
    
    animateAnimals();
    
    // Game functions
    function handleCatch(animal) {
    if (isCaught) return; // Prevent multiple catches
    
    isCaught = true;
    gameState = 'caught';
    
    // Calculate score based on time to catch
    const catchTime = (Date.now() - gameStartTime) / 1000; // seconds
    const points = Math.max(10, 100 - Math.floor(catchTime * 10));
    score += points;
    
    // Visual feedback
    animal.visible = false;
    animal.element.style.display = 'none';
    
    // Show catch feedback
    showCatchFeedback(points);
    
    // Respawn after 2 seconds
    respawnTimer = setTimeout(() => {
        respawnAnimal(animal);
    }, 2000);
}

function respawnAnimal(animal) {
    // Reset animal position to random location
    const video = document.getElementById('video');
    animal.x = video.offsetLeft + Math.random() * (video.offsetWidth - animal.element.offsetWidth);
    animal.y = video.offsetTop + Math.random() * (video.offsetHeight - animal.element.offsetHeight);
    animal.direction = Math.random() * 2 * Math.PI;
    animal.speed = 1.5;
    
    // Make visible again
    animal.visible = true;
    animal.element.style.display = 'block';
    
    // Reset game state
    isCaught = false;
    gameState = 'playing';
    gameStartTime = Date.now();
    catchStartTime = null;
}

function showCatchFeedback(points) {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.style.position = 'absolute';
    feedback.style.top = '50%';
    feedback.style.left = '50%';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.fontSize = '3rem';
    feedback.style.fontWeight = 'bold';
    feedback.style.color = '#4CAF50';
    feedback.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    feedback.style.zIndex = '1000';
    feedback.textContent = `+${points}!`;
    
    document.body.appendChild(feedback);
    
    // Animate and remove
    setTimeout(() => {
        feedback.style.transition = 'all 1s ease-out';
        feedback.style.transform = 'translate(-50%, -150%) scale(1.5)';
        feedback.style.opacity = '0';
        
        setTimeout(() => {
            feedback.remove();
        }, 1000);
    }, 100);
    
    updateScoreDisplay();
}

function updateScoreDisplay() {
    let scoreElement = document.getElementById('scoreDisplay');
    if (!scoreElement) {
        // Create score display if it doesn't exist
        scoreElement = document.createElement('div');
        scoreElement.id = 'scoreDisplay';
        scoreElement.style.position = 'fixed';
        scoreElement.style.top = '10px';
        scoreElement.style.left = '10px';
        scoreElement.style.fontSize = '1.5rem';
        scoreElement.style.fontWeight = 'bold';
        scoreElement.style.color = '#333';
        scoreElement.style.textShadow = '1px 1px 2px rgba(255,255,255,0.8)';
        scoreElement.style.zIndex = '100';
        scoreElement.style.backgroundColor = 'rgba(255,255,255,0.8)';
        scoreElement.style.padding = '5px 10px';
        scoreElement.style.borderRadius = '5px';
        document.body.appendChild(scoreElement);
    }
    scoreElement.innerHTML = `Score: ${score}<br><span style="font-size: 0.8rem;">Faster catch = More points!</span>`;
}
});