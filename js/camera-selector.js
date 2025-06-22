// Camera selector helper
async function listCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('Available cameras:');
        videoDevices.forEach((device, index) => {
            console.log(`${index}: ${device.label || `Camera ${index}`} (${device.deviceId})`);
        });
        
        return videoDevices;
    } catch (error) {
        console.error('Error listing cameras:', error);
        return [];
    }
}

// Function to use a specific camera by index
async function useCamera(index) {
    const cameras = await listCameras();
    if (index >= 0 && index < cameras.length) {
        constraints.video = {
            deviceId: { exact: cameras[index].deviceId }
        };
        startVideoStream();
        console.log(`Switched to camera ${index}: ${cameras[index].label}`);
    } else {
        console.error(`Invalid camera index. Available: 0-${cameras.length - 1}`);
    }
}

// Test camera function
async function testCamera(index) {
    const cameras = await listCameras();
    if (index >= 0 && index < cameras.length) {
        try {
            console.log(`Testing camera ${index}: ${cameras[index].label}...`);
            const testStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: cameras[index].deviceId } }
            });
            console.log(`✓ Camera ${index} works!`);
            // Create a test video element
            const testVideo = document.createElement('video');
            testVideo.srcObject = testStream;
            testVideo.autoplay = true;
            testVideo.style.position = 'fixed';
            testVideo.style.top = '10px';
            testVideo.style.right = '10px';
            testVideo.style.width = '200px';
            testVideo.style.zIndex = '9999';
            testVideo.style.border = '2px solid green';
            document.body.appendChild(testVideo);
            
            // Remove after 3 seconds
            setTimeout(() => {
                testStream.getTracks().forEach(track => track.stop());
                testVideo.remove();
                console.log(`Test complete for camera ${index}`);
            }, 3000);
        } catch (error) {
            console.error(`✗ Camera ${index} failed:`, error.message);
        }
    }
}

// Add to window for easy console access
window.listCameras = listCameras;
window.useCamera = useCamera;
window.testCamera = testCamera;

// Auto-detect and list cameras when page loads
document.addEventListener('DOMContentLoaded', async () => {
    // Request initial camera access to get labels
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        
        // Now list cameras with labels
        await listCameras();
        console.log('To switch cameras, use: useCamera(0) or useCamera(1) in the console');
    } catch (error) {
        console.error('Could not access camera for enumeration:', error);
    }
});