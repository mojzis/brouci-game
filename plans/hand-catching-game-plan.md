# Hand-Catching Animal Game Plan

## Game Overview
Transform the current AR experience into an interactive game where children try to catch virtual animals with their hands. Animals will actively avoid being caught, creating an engaging physical activity game.

## Core Game Mechanics

### 1. Animal Behavior
- **Single Animal Start**: Begin with one animal (beetle) that actively avoids hand contact
- **Avoidance AI**: 
  - Detect hand/palm positions using existing pose detection
  - Calculate escape vectors away from approaching hands
  - Increase speed when hands are nearby (danger zone)
  - Use predictive movement to anticipate hand trajectory
  - Implement "panic mode" with erratic movements when cornered

### 2. Hand Detection & Catching
- **Detection Method**:
  - Use existing pose detection for hand/wrist keypoints
  - Create "catch zones" around detected palms
  - Consider both hands independently
- **Catch Mechanics**:
  - Animal is caught when overlapping with palm catch zone for 0.5 seconds
  - Visual feedback during near-catch (animal flashes/shakes)
  - Successful catch triggers celebration animation

### 3. Game States
- **Start Screen**: Instructions and "Start Game" button
- **Playing**: Active gameplay with timer and score
- **Caught**: Brief celebration, then respawn animal
- **Game Over**: Show final score and play again option

### 4. Scoring System
- Points based on:
  - Time to catch (faster = more points)
  - Animal difficulty level
  - Combo multiplier for consecutive catches
- Display current score and high score

### 5. Difficulty Progression
- **Level 1**: Single slow beetle
- **Level 2**: Faster movement, better avoidance
- **Level 3**: Multiple animals
- **Level 4**: Different animal types with unique behaviors

## Technical Implementation

### Phase 1: Core Mechanics (MVP)
1. Modify animal movement to actively avoid detected hands
2. Implement hand overlap detection for catching
3. Add catch animation and respawn logic
4. Basic score counter

### Phase 2: Game Polish
1. Add game states (menu, playing, game over)
2. Implement timer and round system
3. Add sound effects and visual feedback
4. Create difficulty levels

### Phase 3: Enhanced Features
1. Multiple animal types with different behaviors
2. Power-ups (slow motion, freeze)
3. Leaderboard/high scores
4. Achievement system

## User Interface Updates
- Score display (top left)
- Timer (top center)
- Caught counter (top right)
- Start/Restart button
- Instructions overlay

## Animal Avoidance Behaviors
1. **Basic Flee**: Move directly away from nearest hand
2. **Smart Dodge**: Predict hand movement and dodge perpendicular
3. **Corner Escape**: Special moves when trapped in corners
4. **Speed Burst**: Temporary speed increase when hands very close
5. **Teleport**: Rare ability to teleport when about to be caught

## Success Metrics
- Average time to catch
- Number of attempts before catch
- Player engagement time
- Difficulty progression rate

## Future Enhancements
- Multiplayer mode (competitive catching)
- Different themed environments
- Special event animals
- Educational mode (learn about animals)
- Accessibility options (adjust speed, visual aids)