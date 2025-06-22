# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an augmented reality (AR) hand-catching game where children try to catch virtual animals with their hands. The animals actively avoid being caught, creating an engaging physical activity game. Built with vanilla JavaScript, HTML5, and CSS, using WebRTC for camera access, TensorFlow.js for hand detection, and device motion APIs.

## Key Commands

### Running the Application
- Open `index.html` in a web browser (preferably on a mobile device)
- No build process required - this is a static website
- For development: Use a local web server to avoid CORS issues with camera access (e.g., `python -m http.server` or VS Code Live Server)

### Testing Motion Features
- Open `tst.html` to test device shake detection independently
- Shake threshold is set to 15 in both files

## Architecture Overview

### Core Game Components

1. **Camera & Hand Detection System** (`js/animals.js`):
   - WebRTC getUserMedia API for camera access
   - TensorFlow.js MoveNet for hand/pose detection
   - Hand tracking with palm and wrist keypoints
   - Front/rear camera toggle support

2. **Animal Behavior System**:
   - **Avoidance AI**: Animals actively flee from detected hands
   - **Escape Patterns**:
     - Basic flee: Direct movement away from hands
     - Smart dodge: Perpendicular escape routes
     - Panic mode: Erratic movement when cornered
     - Speed burst: Temporary acceleration near hands
   - **Movement Patterns**: Oscillation, jump, loop, jitter
   - **Collision Avoidance**: Animals avoid overlapping

3. **Game Mechanics**:
   - **Hand Detection**: Creates catch zones around detected palms
   - **Catching**: Overlap with palm for 0.5 seconds to catch
   - **Scoring**: Points based on catch time and difficulty
   - **Game States**: Menu, playing, caught, game over
   - **Difficulty Progression**: Faster animals, multiple targets

### Key Functions in `js/animals.js`:

- `startVideoStream()`: Initializes camera feed
- `initializePoseDetection()`: Sets up TensorFlow.js hand detection
- `detectPoses()`: Detects hand positions from video feed
- `avoidPeople()`: Core avoidance AI - makes animals flee from hands
- `checkHandCatch()`: Detects when hand overlaps with animal
- `updatePosition()`: Movement logic with escape patterns
- `animateAnimals()`: Main game loop using requestAnimationFrame

### Game Parameters:
- **Catch Detection**: 0.5 second overlap required
- **Avoidance Radius**: 150 pixels around hands
- **Escape Speed Multiplier**: 2x normal speed when fleeing
- **Respawn Delay**: 2 seconds after catch
- **Score Calculation**: Base 100 points - (seconds to catch * 10)