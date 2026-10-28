                                                
import { DEGREES } from "./degree-types.js";

                                                   
                                         
                       
                                                                           
                                          

                             
                   
                                                          
                    
                                          
                    
 

const SHAPE_TABLE                                                                      = {
  do: {
    white: {
      up: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
      down: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
      none: { shape: "triangle-up", smuflName: "noteShapeTriangleUpWhite", codepoint: 0xE1BA },
    },
    black: {
      up: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
      down: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
      none: { shape: "triangle-up", smuflName: "noteShapeTriangleUpBlack", codepoint: 0xE1BB },
    }
  },
  re: {
    white: {
      up: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
      down: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
      none: { shape: "moon", smuflName: "noteShapeMoonWhite", codepoint: 0xE1BC },
    },
    black: {
      up: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
      down: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
      none: { shape: "moon", smuflName: "noteShapeMoonBlack", codepoint: 0xE1BD },
    }
  },
  mi: {
    white: {
      up: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
      down: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
      none: { shape: "diamond", smuflName: "noteShapeDiamondWhite", codepoint: 0xE1B8 },
    },
    black: {
      up: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
      down: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
      none: { shape: "diamond", smuflName: "noteShapeDiamondBlack", codepoint: 0xE1B9 },
    }
  },
  fa: {
    white: {
      up: { shape: "triangle-left", smuflName: "noteShapeTriangleLeftWhite", codepoint: 0xE1B6 },
      down: { shape: "triangle-right", smuflName: "noteShapeTriangleRightWhite", codepoint: 0xE1B4 },
      none: { shape: "triangle-right", smuflName: "noteShapeTriangleRightWhite", codepoint: 0xE1B4 },
    },
    black: {
      up: { shape: "triangle-left", smuflName: "noteShapeTriangleLeftBlack", codepoint: 0xE1B7 },
      down: { shape: "triangle-right", smuflName: "noteShapeTriangleRightBlack", codepoint: 0xE1B5 },
      none: { shape: "triangle-right", smuflName: "noteShapeTriangleRightBlack", codepoint: 0xE1B5 },
    }
  },
  sol: {
    white: {
      up: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
      down: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
      none: { shape: "round", smuflName: "noteShapeRoundWhite", codepoint: 0xE1B0 },
    },
    black: {
      up: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
      down: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
      none: { shape: "round", smuflName: "noteShapeRoundBlack", codepoint: 0xE1B1 },
    }
  },
  la: {
    white: {
      up: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
      down: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
      none: { shape: "square", smuflName: "noteShapeSquareWhite", codepoint: 0xE1B2 },
    },
    black: {
      up: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
      down: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
      none: { shape: "square", smuflName: "noteShapeSquareBlack", codepoint: 0xE1B3 },
    }
  },
  ti: {
    white: {
      up: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
      down: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
      none: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundWhite", codepoint: 0xE1BE },
    },
    black: {
      up: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
      down: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
      none: { shape: "triangle-round", smuflName: "noteShapeTriangleRoundBlack", codepoint: 0xE1BF },
    }
  }
};

export function isDegree(x         )              {
  return typeof x === "string" && DEGREES.includes(x          );
}

export function degreeFromStep(n        )         {
  if (!Number.isInteger(n)) {
    throw new RangeError(`Invalid step: ${n}`);
  }
  const index = ((n % 7) + 7) % 7;
  return DEGREES[index];
}

const DURATION_TO_FILL                           = {
  4: "white",
  3: "white",
  2: "white",
  1.5: "black",
  1: "black",
  0.5: "black"
};

export function fillForDuration(quarters        )           {
  const fill = DURATION_TO_FILL[quarters];
  if (fill === undefined) {
    throw new RangeError(`Invalid duration: ${quarters}`);
  }
  return fill;
}

export function shapeFor(degree        , fill          , stem               )             {
  if (!isDegree(degree)) {
    throw new RangeError(`Invalid degree: ${degree}`);
  }
  if (fill !== "white" && fill !== "black") {
    throw new RangeError(`Invalid fill: ${fill}`);
  }
  if (stem !== "up" && stem !== "down" && stem !== "none") {
    throw new RangeError(`Invalid stem direction: ${stem}`);
  }
  return SHAPE_TABLE[degree][fill][stem];
}

export function glyphChar(glyph            )         {
  return String.fromCodePoint(glyph.codepoint);
}
