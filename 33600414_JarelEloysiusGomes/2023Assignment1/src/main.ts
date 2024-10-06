/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import { fromEvent, interval, Observable, merge, Subject } from 'rxjs';
import { map, filter, scan, tap } from 'rxjs/operators';
/** Constants */

const Viewport = {
  CANVAS_WIDTH: 200,
  CANVAS_HEIGHT: 400,
  PREVIEW_WIDTH: 160,
  PREVIEW_HEIGHT: 80,
} as const;

const Constants = {
  TICK_RATE_MS: 500,
  GRID_WIDTH: 10,
  GRID_HEIGHT: 20,
} as const;

const Block = {
  WIDTH: Viewport.CANVAS_WIDTH / Constants.GRID_WIDTH,
  HEIGHT: Viewport.CANVAS_HEIGHT / Constants.GRID_HEIGHT,
};

/** User input */
type Key = "KeyS" | "KeyA" | "KeyD" | "KeyW" | "Space" | "KeyR" | "KeyP";
type Event = "keydown" | "keyup" | "keypress";

type ActionForKey = { apply: (s: State) => State };

// Types for game elements
type Block = { x: number, y: number, color: string };
type Tetrimino = Block[];

/** Utility functions */

/** State processing */

/**
 * Represents the state of the game.
 *
 * @param grid - The game grid as a 2D array of booleans.
 * @param currentTetrimino - The currently active Tetrimino.
 * @param nextTetrimino - The next Tetrimino in the queue.
 * @param gameOver - Indicates whether the game is over.
 * @param userScore - The user's current score.
 * @param userLevel - The user's current level.
 * @param highScore - The highest score achieved in the game.
 * @param paused - Indicates whether the game is paused.
 *
 * @returns An object representing the game state.
 */
type State = {
  grid: boolean[][],
  currentTetrimino: Tetrimino,
  nextTetrimino: Tetrimino; // Add nextTetrimino property
  gameOver: boolean,
  userScore: number,       // Add score property
  userLevel: number,       // Add level property
  highScore: number,   // Add highScore property
  paused: boolean     // Add isPaused property
};

/**
 * Initializes the game state.
 * @returns {State} The initial game state.
 */
const initialState: State = {
  grid: Array.from({ length: 20 }, () => Array(10).fill(false)),
  currentTetrimino: generateANewTetrimino(),
  nextTetrimino: generateANewTetrimino(), // Initialize nextTetrimino
  gameOver: false,
  userScore: 0,            // Initialize score to 0
  userLevel: 1,            // Initialize level to 1
  highScore: 0,        // Initialize highScore to 0
  paused: false, // Initialize isPaused to false
};

/**
 * Define the gold Tetrimino.
 * @returns {Tetrimino} The gold Tetrimino shape as an array of block objects.
 */
const goldTetrimino: Tetrimino = [
  { x: 0, y: 0, color: 'gold' },
  // Add other blocks to define the shape of the gold Tetrimino
];


/**
 * Move the current Tetrimino down by one unit.
 *
 * @param {State} s - The current game state.
 * @returns {State} The updated game state with the Tetrimino moved down.
 */
const tick = (s: State): State => {
  const newTetrimino = s.currentTetrimino.map(block => ({...block, x: block.x, y: block.y + 1 }));
  return { ...s, currentTetrimino: newTetrimino, nextTetrimino: generateANewTetrimino() };
};


/**
 * Check if there is a collision between a moved Tetrimino and the game grid.
 * @param movedTetrimino The Tetrimino that has been moved.
 * @param grid The game grid represented as a boolean 2D array.
 * @returns True if a collision is detected, otherwise false.
 */
function isCollisionDetected(movedTetrimino: Tetrimino, grid: boolean[][]): boolean {
  return movedTetrimino.some(block => 
    block.y >= Constants.GRID_HEIGHT || grid[block.y][block.x]
  );
}


/**
 * Processes collisions in the game.
 * @param s - The game state to process collisions for.
 * @returns The updated game state after processing collisions.
 */
function processCollision(s: State): State {
  // Check if the game is paused
  if (s.paused) {
    return s; // Return the current state without making any changes
  }

  // Create a new grid with the current Tetrimino placed on it
  const newGrid = placeTetrimino(s.currentTetrimino, s.grid);
  // Clear completed lines
  const { grid, linesCleared, goldLineCleared } = clearLines(newGrid, goldTetrimino);
  // Calculate the new score based on the number of lines cleared
  const newScore = s.userScore + linesCleared * 100;// 100 points per cleared line

  // Double the score if a gold Tetrimino line was cleared
  const goldLines = goldTetrimino.filter((block) => block.y === linesCleared - 1);
  const goldScoreIncrease = goldLineCleared ? goldLines.length * 200 : 0;

  // Update high score if needed
  const newHighScore = Math.max(s.highScore, newScore + goldScoreIncrease);

  // Calculate the new level based on the new score
  const newLevel = Math.floor(newScore / 1000) + 1; // Increase level every 1000 points

  // Calculate the new tick rate based on the new level
  const newTetrimino = s.nextTetrimino;

  // Next Tetrimino is now the current Tetrimino
  const newNextTetrimino = generateANewTetrimino();

  // Return the updated state
  return isCollisionDetected(newTetrimino, grid)
    ? { ...s, gameOver: true, userScore: newScore + goldScoreIncrease, highScore: newHighScore }
    : {
        grid,
        currentTetrimino: newTetrimino,
        nextTetrimino: newTetrimino,
        gameOver: false,
        userScore: newScore + goldScoreIncrease,
        userLevel: newLevel,
        highScore: newHighScore,
        paused: s.paused,
      };
}


// Left, Right, Down, Rotate, Drop, Restart, Pause/Resume

/**
 * Move Tetrimino Left
 * @param s - The current game state
 * @returns The updated game state after moving the Tetrimino left
 */
class moveTetriminoLeft implements ActionForKey {
  // Apply the action to the current state
  apply(s: State): State {
    // Calculate the new positions of the Tetrimino blocks when moved left
    const newTetrimino = s.currentTetrimino.map(block => ({
      ...block,
      x: block.x - 1,
    }));

    // Check for wall collision on the left side
    const isLeftCollision = newTetrimino.some(block => block.x < 0);

    // Check for collision with existing blocks in the grid
    const isGridCollision = isCollisionDetected(newTetrimino, s.grid);

    // Return the updated state based on collision results
    return isLeftCollision || isGridCollision
      ? s // Don't update state if detect collision
      : { ...s, currentTetrimino: newTetrimino };
  }
}

/**
 * Moves the Tetrimino to the right.
 * @param s - The current game state.
 * @returns The updated game state after the Tetrimino has been moved.
 */
class moveTetriminoRight implements ActionForKey {
  // Apply the action to the current state
  apply(s: State): State {
    // Calculate the new positions of the Tetrimino blocks when moved right
    const newTetrimino = s.currentTetrimino.map(block => ({
      ...block, // Spread operator to copy the block object
      x: block.x + 1, // Move the block to the right
    }));

    // Check for wall collision on the right side
    const isRightCollision = newTetrimino.some(
      block => block.x >= Constants.GRID_WIDTH
    );

    // Check for collision with existing blocks in the grid
    const isGridCollision = isCollisionDetected(newTetrimino, s.grid);

    // Return the updated state based on collision results
    return isRightCollision || isGridCollision
      ? s // Don't update state if detected collision
      : { ...s, currentTetrimino: newTetrimino };
  }
}


/**
 * Move Tetrimino Down Action
 * @param {State} s - The current game state.
 * @returns {State} - The updated game state after moving the Tetrimino down.
 */
class moveTetriminoDown implements ActionForKey {
  // Apply the action to the current state
  apply(s: State): State {
    // Calculate the new positions of the Tetrimino blocks when moved down
    const newTetrimino = s.currentTetrimino.map(block => ({
      ...block, // Spread operator to copy the block object
      y: block.y + 1, // Move the block down
    }));

    // Check for collision with existing blocks in the grid
    const isGridCollision = isCollisionDetected(newTetrimino, s.grid);

    // Generate the next Tetrimino
    const nextTetrimino = generateANewTetrimino();

    // Return the updated state based on collision results
    return isGridCollision
      ? { ...processCollision(s), nextTetrimino } // Process collision if detected
      : { ...s, currentTetrimino: newTetrimino, nextTetrimino }; // Update state if no collision
  }
}

/**
 * Rotates a Tetrimino.
 *
 * @param {Tetrimino} tetrimino - The Tetrimino to be rotated.
 * @returns {Tetrimino} The rotated Tetrimino.
 */
function rotateTetrimino(tetrimino: Tetrimino): Tetrimino {
  // Get the origin of the Tetrimino
  const origin = tetrimino[0];
  // Rotate the Tetrimino around the origin
  const rotatedTetrimino = tetrimino.map(({ x, y, color }) => ({
    x: origin.x - (y - origin.y), // x = x0 - (y - y0), which basically swaps the x and y coordinates
    y: origin.y + (x - origin.x), // y = y0 + (x - x0), which basically swaps the x and y coordinates
    color // Keep the color the same
  }));
  // Return the rotated Tetrimino
  return rotatedTetrimino;
}

/**
 * Rotates the current Tetrimino.
 *
 * @param s - The current state.
 * @returns The updated state after rotating the Tetrimino if no collision or edge conditions are met, otherwise, the current state remains unchanged.
 */
class Rotate implements ActionForKey {
  // Apply the action to the current state
  apply(s: State): State {
    // Calculate the rotated Tetrimino without modifying the original
    const rotatedTetrimino = rotateTetrimino([...s.currentTetrimino]);

    // Check collision and edge conditions
    const isGridCollision = isCollisionDetected(rotatedTetrimino, s.grid); // Check for collision with existing blocks in the grid
    const willExceedEdgesCondition = willExceedEdges(rotatedTetrimino, s.grid); // Check if the Tetrimino will exceed the edges of the grid

    // Return the updated state based on collision and edge conditions
    return isGridCollision || willExceedEdgesCondition
      ? s // Don't rotate if collision or edge conditions are met
      : { ...s, currentTetrimino: rotatedTetrimino };
  }
}


/**
 * Checks if a Tetrimino will exceed the edges of the grid.
 * @param tetrimino - The Tetrimino to check.
 * @param grid - The grid represented as a boolean 2D array.
 * @returns `true` if any part of the Tetrimino will exceed the grid edges, `false` otherwise.
 */
function willExceedEdges(tetrimino: Tetrimino, grid: boolean[][]): boolean {
  // Get the width and height of the grid
  const gridWidth = grid[0].length; // The width is the length of the first row
  const gridHeight = grid.length; // The height is the length of the grid

  // Check if any of the blocks will exceed the edges of the grid
  return tetrimino.some(({ x, y }) => {
    // Check if the block will exceed the left or right edge
    return x < 0 || x >= gridWidth || y >= gridHeight;
  });
}


/**
 * Applies the instant drop action to the current state.
 *
 * This function moves the current Tetrimino down until it collides with
 * existing blocks in the grid, and then updates the game state accordingly.
 *
 * @param {State} s - The current game state.
 * @returns {State} The updated game state after applying the instant drop action.
 */
class instantDROP implements ActionForKey {
  // Apply the action to the current state
  apply(s: State): State {
    // Calculate the new positions of the Tetrimino blocks when moved down
    let newTetrimino = s.currentTetrimino;
    // Move the Tetrimino down until it collides with existing blocks in the grid
    while (!isCollisionDetected(newTetrimino, s.grid)) {
      newTetrimino = newTetrimino.map(block => ({ ...block, x: block.x, y: block.y + 1 })); // Move the Tetrimino down
    }
    // Return the updated state
    newTetrimino = newTetrimino.map(block => ({ ...block, x: block.x, y: block.y - 1 }));

    // Check for collision with existing blocks in the grid
    if (isCollisionDetected(newTetrimino, s.grid)) {
      // Return the updated state if there's a collision
      return { ...processCollision(s), nextTetrimino: generateANewTetrimino() }; // Process collision if detected
    }

    // Return the updated state if there's no collision
    return { ...s, currentTetrimino: newTetrimino, nextTetrimino: generateANewTetrimino() }; // Update state if no collision
  }
}


/**
 * Duplicates a grid.
 * @param board - The grid to duplicate.
 * @returns A new grid that is a duplicate of the input grid.
 */
const gridDuplicate = (grid: boolean[][]): boolean[][] => {
  return grid.map(row => [...row]);
};


/**
 * Restarts the game.
 * @implements {ActionForKey}
 */
class Restart implements ActionForKey {
  apply(s: State): State {
    // Reset the game to its initial state, but keep the high score
    return { ...initialState, highScore: s.highScore };
  }
}


/**
 * Toggles pause and resume of the game.
 * @implements {ActionForKey}
 */
class TogglePauseResume implements ActionForKey {
  private isPaused: boolean = false;

  apply(s: State): State {
    if (!this.isPaused) {
      // Pause the game
      this.isPaused = true;
      return { ...s, paused: true };
    } else {
      // Resume the game
      this.isPaused = false;
      return { ...s, paused: false };
    }
  }
}



/**
 * Toggles pause and resume of the game.
 * @implements {ActionForKey}
 */
class Tick implements ActionForKey {
  // The elapsed time is passed as a parameter
  constructor(public readonly elapsed: number) {}
  
  // Apply the action to the current state
  apply(s: State): State {
    // Check if the game is paused
    const movedTetrimino = s.currentTetrimino.map(block => ({ ...block, x: block.x, y: block.y + 1 }));
    
    // Check for collision with existing blocks in the grid
    if (isCollisionDetected(movedTetrimino, s.grid)) {
      return { ...processCollision(s), nextTetrimino: generateANewTetrimino() };
    }
    
    // Return the updated state if there's no collision
    return {
      ...s,
      currentTetrimino: movedTetrimino,
      nextTetrimino: generateANewTetrimino(),
    };
  }
}

/**
 * Place a Tetrimino on a grid.
 * 
 * @param {Tetrimino} tetrimino - The Tetrimino to place on the grid.
 * @param {boolean[][]} grid - The grid where the Tetrimino will be placed.
 * @returns {boolean[][]} - A new grid with the Tetrimino placed on it.
 */
function placeTetrimino(tetrimino: Tetrimino, grid: boolean[][]): boolean[][] {
  // Duplicate the grid to avoid mutating the original
  return tetrimino.reduce((newGrid, block) => {
    // Update the grid with the new block
    return newGrid.map((row, rowIndex) => {
      // Check if the current row matches the block's y position
      if (rowIndex === block.y) {
        // Update the row with the new block
        return row.map((cell, colIndex) => {
          // Check if the current cell matches the block's x position
          if (colIndex === block.x) {
            // Update the cell with the new block
            return true;
          }
          // Return the cell without updating it
          return cell;
        });
      }
      // Return the row without updating it
      return row;
    });
    // Initialize the grid with empty rows
  }, grid);
}


/**
 * Clears completed lines in the grid and checks for a gold Tetrimino in cleared lines.
 *
 * @param grid - The grid containing the game state as a 2D array of booleans.
 * @param goldTetrimino - The gold Tetrimino to check for in cleared lines.
 *
 * @returns An object containing the updated grid, the number of lines cleared, and whether a gold line was cleared.
 */
function clearLines(grid: boolean[][], goldTetrimino: Tetrimino): { grid: boolean[][], linesCleared: number, goldLineCleared: boolean } {
  // Function to create an empty row
  const emptyRow = (length: number): boolean[] => Array(length).fill(false);

  // Initialize the state
  const initialState = { grid: [] as boolean[][], linesCleared: 0, goldLineCleared: false };

  //  Check if any of the rows are completed
  const result = grid.reduce((state, row) => {
    // Check if the row is completed
    if (row.every(cell => cell)) {
      // Check if the row contains a gold Tetrimino
      const goldLineCleared = row.some((_, x) => goldTetrimino.some(block => block.x === x && block.y === state.linesCleared));
      //  Return the updated state
      return { 
        grid: state.grid, 
        linesCleared: state.linesCleared + 1, 
        goldLineCleared: goldLineCleared || state.goldLineCleared 
      };
    }
    // Return the updated state
    return { 
      grid: [...state.grid, row], 
      linesCleared: state.linesCleared,
      goldLineCleared: state.goldLineCleared
    };
  }, initialState);

  // Add empty rows to the top of the grid
  const emptyRows = Array(result.linesCleared).fill(emptyRow(grid[0].length));
  // Return the updated grid
  return {
    grid: [...emptyRows, ...result.grid],
    linesCleared: result.linesCleared,
    goldLineCleared: result.goldLineCleared
  };
}

/**
 * Function to check if a Tetrimino is a gold Tetrimino
 * @param seed - The seed value for random number generation
 * @returns A hash of the seed
 */
abstract class RNG {
  // LCG using GCC's constants
  private static readonly m = 0x80000000; // 2**31;
  private static readonly a = 1103515245; // Choose a
  private static readonly c = 12345; // Choose c to be coprime to m

  // Function to generate a hash from a seed
  public static hash = (seed: number) => Math.abs(RNG.a * seed + RNG.c) % RNG.m;

  //  Function to scale a hash to a value between -1 and 1
  public static scale = (hash: number) => (2 * hash) / (RNG.m - 1) - 1;
}


/**
 * Creates a random number stream using a linear congruential generator (LCG) from an Observable source.
 *
 * @param source$ - The source Observable.
 * @param seed - The seed value for the LCG (default is 0).
 * @returns An Observable that emits random numbers between -1 and 1.
 */
export function createRngStreamFromSource<T>(source$: Observable<T>) {
  return function createRngStream(seed: number = 0
  ): Observable<number> {
    const randomNumberStream = source$.pipe(
      scan((hash) => RNG.hash(hash), seed),
      map(RNG.scale)
    );

    return randomNumberStream;
  };
}


/**
 * Generates a new Tetrimino.
 * @returns {Tetrimino} A Tetrimino object representing the generated shape.
 */
function generateANewTetrimino(): Tetrimino {
  const shapes = [
    // Shape 1: Cyan
    [
      { x: 0, y: 0, color: 'cyan' },
      { x: 0, y: 1, color: 'cyan' },
      { x: 0, y: 2, color: 'cyan' },
      { x: 0, y: 3, color: 'cyan' }
    ],
    // Shape 2: Yellow
    [
      { x: 0, y: 0, color: 'yellow' },
      { x: 1, y: 0, color: 'yellow' },
      { x: 0, y: 1, color: 'yellow' },
      { x: 1, y: 1, color: 'yellow' }
    ],
    // Shape 3: Blue
    [
      { x: 1, y: 0, color: 'blue' },
      { x: 2, y: 0, color: 'blue' },
      { x: 0, y: 1, color: 'blue' },
      { x: 1, y: 1, color: 'blue' }
    ],
    // Shape 4: Green
    [
      { x: 0, y: 0, color: 'green' },
      { x: 1, y: 0, color: 'green' },
      { x: 1, y: 1, color: 'green' },
      { x: 2, y: 1, color: 'green' }
    ],
    // Shape 5: Orange
    [
      { x: 0, y: 0, color: 'orange' },
      { x: 0, y: 1, color: 'orange' },
      { x: 0, y: 2, color: 'orange' },
      { x: 1, y: 2, color: 'orange' }
    ],
    // Shape 6: Red
    [
      { x: 0, y: 0, color: 'red' },
      { x: 0, y: 1, color: 'red' },
      { x: 0, y: 2, color: 'red' },
      { x: 1, y: 2, color: 'red' }
    ],
    // Shape 7: Purple
    [
      { x: 1, y: 0, color: 'purple' },
      { x: 0, y: 1, color: 'purple' },
      { x: 1, y: 1, color: 'purple' },
      { x: 2, y: 1, color: 'purple' }
    ]
  ];

  // Calculate the xOffset so that the Tetrimino starts in the middle of the grid
  const xOffset = Math.floor((Constants.GRID_WIDTH - 2) / 2); // Center the Tetrimino
  
  // Calculate the yOffset so that the Tetrimino starts at the top of the grid
  const yOffset = 0;

  // Generate a random number between 0 and 6
  const shapeIndex = Math.floor(Math.random() * shapes.length); // Random shape
  
  // Add a gold Tetrimino as an option
  // 8th special case: GOLD
  const goldTetrimino: Tetrimino = [
    { x: xOffset + 0, y: 0, color: 'gold' },
    { x: xOffset + 0, y: 1, color: 'gold' },
    { x: xOffset + 1, y: 1, color: 'gold' },
    { x: xOffset + 1, y: 2, color: 'gold' },
  ];

  // Generate a random number between 0 and 100
  const randomChance = Math.floor(Math.random() * 101);

  const x2Offset = Math.floor((Constants.GRID_WIDTH - 10) / 2); // Center the Tetrimino
  
  // 5% chance of getting a gold Tetrimino
  if (randomChance <= 5) {
    return goldTetrimino.map((block) => ({ 
      ...block,
      x: block.x + x2Offset,
      y: block.y + yOffset,
    }));
  } else {
    return shapes[shapeIndex].map((block) => ({
      ...block,
      x: block.x + xOffset,
      y: block.y + yOffset,
    }));
  }
}



/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {}
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
};

/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main() {
  // Canvas elements
  const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
    HTMLElement;
  const preview = document.querySelector("#svgPreview") as SVGGraphicsElement &
    HTMLElement;
  const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
    HTMLElement;
  // Add a new HTML element to represent the preview Tetrimino on the sidebar
  const previewSidebar = document.querySelector("#previewSidebar") as HTMLElement;
  const container = document.querySelector("#main") as HTMLElement;

  // Get the <g> element with the id "gameOver"
  const gameOverGroup = document.getElementById("gameOver");

  // Get references to the elements within the group
  const rect1 = document.querySelector('#gameOver rect:first-child');
  const text1 = document.querySelector('#gameOver text:first-child');
  const rect2 = document.querySelector('#gameOver rect:last-child');
  const text2 = document.querySelector('#gameOver text:last-child');

  // Check if any of the elements are null before appending
  if (rect1 && text1 && rect2 && text2) {
    // Reorder the elements by appending them in the desired order
    gameover.appendChild(rect1); // Move the first rect to the end
    gameover.appendChild(text1); // Move the first text to the end
    gameover.appendChild(rect2); // Move the second rect to the end
    gameover.appendChild(text2); // Move the second text to the end
  } else {
    console.error("One or more elements not found");
  }



  // Set the height and width of the SVG elements
  svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
  svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);
  preview.setAttribute("height", `${Viewport.PREVIEW_HEIGHT}`);
  preview.setAttribute("width", `${Viewport.PREVIEW_WIDTH}`);

  // Text fields
  const levelText = document.querySelector("#levelText") as HTMLElement;
  const scoreText = document.querySelector("#scoreText") as HTMLElement;
  const highScoreText = document.querySelector("#highScoreText") as HTMLElement;

  /** User input */
  const key$ = fromEvent<KeyboardEvent>(document, "keydown");

  const fromKey = (keyCode: Key) =>
  key$.pipe(
    filter(({ code }) => code === keyCode),
    tap((event) => {
      console.log(`Key pressed: ${event.code}`);
    })
  );

  /** Observables */

  // Calculate the initial tick rate based on the player's level
  const initialTickRate = calculateTickRate(initialState.userLevel);

  // Define the tick observable with the initial tick rate
  const tick$ = interval(initialTickRate).pipe(map(elapsed => new Tick(elapsed)));

  // Define a function that calculates the tick rate based on the player's level
  function calculateTickRate(level: number): number {
    const tickRateReductionPercentage = 0.1; // 10% reduction per level
    const initialTickRate = Constants.TICK_RATE_MS;
  
    // Use the formula for exponential decay to calculate the tick rate
    const tickRate = initialTickRate * Math.pow(1 - tickRateReductionPercentage, level - 1);
  
    return tickRate;
  }
  
  // Define the observables for each user input
  const startMoveLeft$ = fromKey('KeyA').pipe(map(_ => new moveTetriminoLeft())); // Listen to A key for left movement
  const startMoveRight$ = fromKey('KeyD').pipe(map(_ => new moveTetriminoRight())); // Listen to D key for right movement
  const startMoveDown$ = fromKey('KeyS').pipe(map(_ => new moveTetriminoDown()));// Listen to S key for down movement
  const startMoveRotate$ = fromKey('KeyW').pipe(map(_ => new Rotate())); // Listen to W key for rotation
  const startDrop$ = fromKey('Space').pipe(map(_ => new instantDROP())); // Listen to spacebar for immediate drop
  const restart$ = fromKey('KeyR').pipe(
    map(() => {
      const initialState = resetGame();
      stateSubject.next(initialState); // Update the state subject with the new state
      hide(gameover); // Hide the "game over" screen
      return new Restart(); // Return the action for consistency
    })
  );
  
  const togglePauseResume$ = fromKey('KeyP').pipe(
    map(event => {
      console.log('Key pressed:', event.code); // Add this line
      return new TogglePauseResume();
    })
  );
  
 // Define the observable for all user inputs
  const actionForKey$: Observable<ActionForKey> = merge(
    tick$, 
    startMoveLeft$, 
    startMoveRight$, 
    startMoveDown$, 
    startMoveRotate$, 
    startDrop$,
    restart$,
    togglePauseResume$
  );
  
  // Define the state observable
  const state$ = actionForKey$.pipe(
    scan((s: State, action: ActionForKey) => action.apply(s), initialState)
  );

  // Subscribe to the state observable
  state$.subscribe(state => {
    // Inside this callback, you can handle the state updates
    // For example, you can call your render function here
    render(state);
    renderPreview(state.nextTetrimino);
  });



  /**
   * Adds a block to the SVG.
   * @param {number} x - The X-coordinate of the block.
   * @param {number} y - The Y-coordinate of the block.
   * @param {string} color - The color of the block.
   */
  const addBlock = (x: number, y: number, color: string) => {
    const blockClump = createSvgElement(svg.namespaceURI, "rect", {
      height: `${Block.HEIGHT}`,
      width: `${Block.WIDTH}`,
      x: `${Block.WIDTH * x}`,
      y: `${Block.HEIGHT * y}`,
      style: `fill: ${color}`,
    });
    svg.appendChild(blockClump);
  };


  /**
   * Resets the game state to its initial values.
   * @returns {State} The updated game state after resetting.
   */
  function resetGame(): State {
    return {
      grid: Array.from({ length: Constants.GRID_HEIGHT }, () => Array(Constants.GRID_WIDTH).fill(false)),
      currentTetrimino: generateANewTetrimino(),
      nextTetrimino: generateANewTetrimino(),
      gameOver: true,
      userScore: 0,
      userLevel: 1,
      highScore: 0,
      paused: false,
    };
  }
  
  // Renders a row of blocks
  const renderForEachRow = (row: boolean[], y: number) => {
    row.forEach((cell, x) => {
      // Use RGBA notation to set the color with opacity
      const color = cell ? 'rgba(255, 255, 255, 0.5)' : 'transparent'; // White with 50% opacity for frozen blocks, transparent for empty blocks
      addBlock(x, y, color);
    });
  };
  

  /**
   * Renders the current state to the canvas.
   *
   * In MVC terms, this updates the View using the Model.
   *
   * @param s Current state
   */
  const render = (s: State) => {
    svg.innerHTML = '';  // Clear previous blocks
    svg.appendChild(gameover);
  
    // Render static blocks on the grid
    s.grid.forEach((row, y) => renderForEachRow(row, y));
  
    // Render the current moving piece
    s.currentTetrimino.forEach(block => {
      const color = block.color === 'gold' ? 'gold' : block.color;
      addBlock(block.x, block.y, color);
    });

    // Check if there are gold Tetriminos in the current state
    const hasGoldTetriminos = s.currentTetrimino.some((block) => block.color === 'gold');

    // Check if gold Tetriminos are involved in a completed line
    const goldTetriminosInLine = s.grid.some((row) =>
      row.every((cell, x) => cell && s.currentTetrimino.some((block) => block.color === 'gold' && block.x === x))
    );

    // Get the message container element
    const messageContainer = document.querySelector("#messageContainer")!;

    // Get the message element
    const goldTetriminoMessage = document.querySelector("#goldTetriminoMessage")!;


    // Display appropriate messages based on conditions
    if (hasGoldTetriminos) {
      goldTetriminoMessage.textContent = "A WILD GOLD TETRIMINO APPEARED!";
      (messageContainer as HTMLElement).style.visibility = "visible"; // Show the message container
    } else if (goldTetriminosInLine) {
      // Determine the multiplier based on the number of gold Tetriminos in the line
      const goldCountInLine = s.grid
        .flatMap((row, y) =>
          row.map((cell, x) => (cell && s.currentTetrimino.some((block) => block.color === 'gold' && block.x === x && block.y === y)))
        )
        .filter(Boolean).length;

      goldTetriminoMessage.textContent = `${goldCountInLine}X POINTS!`;
      goldTetriminoMessage.classList.add('x2'); // Add the 'x2' class for styling
      (messageContainer as HTMLElement).style.visibility = "visible"; // Show the message container
    } else {
      // No gold Tetrimino-related message to display
      goldTetriminoMessage.textContent = "";
      (messageContainer as HTMLElement).style.visibility = "hidden"; // Hide the message container
    }


    // Render the preview of the next Tetrimino
    scoreText.textContent = `${s.userScore}`;
    levelText.textContent = `${s.userLevel}`;
    highScoreText.textContent = `${s.highScore}`;
  };



  /**
   * Function to render the preview of the next Tetrimino
   * @param {boolean[]} row - An array representing the row of blocks.
   * @param {number} y - The y-coordinate of the row.
   */
  function renderPreview(tetrimino: Tetrimino) {
    // Clear the preview SVG
    preview.innerHTML = '';

    // Calculate the position and size of the preview Tetrimino
    const previewBlockSize = Block.WIDTH / 2; // Adjust the size as needed
    const previewX = 0; // Adjust the X position as needed
    const previewY = 0; // Adjust the Y position as needed

    // Render each block of the next Tetrimino in the preview SVG
    tetrimino.forEach((block) => {
      const { x, y, color } = block; // Get the block properties
      // const previewX = 12; // Adjust the X position for the preview bar
      // const previewY = 1; // Adjust the Y position for the preview bar
      const svgElement = createSvgElement(preview.namespaceURI, "rect", {
        height: `${Block.HEIGHT / 2}`, // Adjust the size for the preview bar
        width: `${Block.WIDTH / 2}`, // Adjust the size for the preview bar
        x: `${Block.WIDTH * (block.x)}`,
        y: `${Block.HEIGHT * (block.y)}`,
        style: `fill: ${color}`,
      });
      preview.appendChild(svgElement);
    });
  }
  

  /**
   * Create a subject for managing state updates
   *
   * @returns {void}
   */
  const stateSubject: Subject<State> = new Subject<State>();

  function handleGameOver() {
    // Display the "game over" screen
    show(gameover);
  
    // Delay for a short duration (e.g., 2 seconds) to let the "game over" text display
    setTimeout(() => {
      // Reset the game state to its initial state and preserve the high score
      const initialState = { ...resetGame(), highScore: (stateSubject as any).value.highScore };
      stateSubject.next(initialState); // Update the state subject with the new state
  
      // Hide the "game over" screen
      hide(gameover);
    }, 2000); // Adjust the delay time as needed
  }
  
  
  /**
   * Initializes and controls background music playback.
   * @listens DOMContentLoaded
   */
  document.addEventListener("DOMContentLoaded", function() {
    // Get the toggle music button
    const toggleMusicButton = document.querySelector("#toggleMusic");
  
    // Check if the button exists
    if (toggleMusicButton) {
      // Create an audio element
      const audio = document.createElement("audio");
      audio.id = "backgroundMusic";
      audio.loop = true;
  
      // Add a source element to the audio element
      const source = document.createElement("source");
      source.src = "file:///C:/Users/Jarel%20Gomes/Documents/2023Assignment1-planb/2023Assignment1/Storyline.wav";
      source.type = "audio/wav";
  
      // Add the source element to the audio element
      audio.appendChild(source);
  
      // Append the audio element to the body
      document.body.appendChild(audio);
  
      let isMusicPlaying = false; // Keep track of whether music is currently playing
  
      // Function to toggle music on/off
      const toggleMusic = () => {
        if (isMusicPlaying) {
          audio.pause(); // Pause the music
          isMusicPlaying = false;
          toggleMusicButton.textContent = "Play Music";
        } else {
          audio.play().catch(error => {
            console.error("Error playing audio:", error);
          }); // Play the music
          isMusicPlaying = true;
          toggleMusicButton.textContent = "Pause Music";
        }
      };
  
      // Add an event listener to the toggle button
      toggleMusicButton.addEventListener("click", toggleMusic);
    }
  });

  // Subscribe to the state observable
  const source$ = state$.subscribe((s: State) => {
    if (s.gameOver) {
      handleGameOver();
    } else {
      hide(gameover);
    }
    render(s);
    renderPreview(s.nextTetrimino);
  });
}

  
// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}