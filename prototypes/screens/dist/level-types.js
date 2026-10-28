// Neighbour module (written by Claude). Level settings and the exercise shape.
// Degrees are integers relative to do: 0 = do, 1 = re … 6 = ti, 7 = do above,
// -1 = ti below, -2 = la below, -3 = sol below.

/** The parameters that define one level. Every level uses the same algorithm. */
                                
                
                                               
                             
                                                                                          
                  
                                                                                                  
                                          
                                                                                
                  
                                                                  
                  
 

/** One exercise: parallel lists of degrees and note lengths (quarter notes). */
                           
                    
                   
 

const QUARTERS = [[1, 1, 1, 1]];
const HALVES = [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [2, 2]];
const DOTTED = [...HALVES, [1.5, 0.5, 1, 1], [1, 1, 1.5, 0.5], [1.5, 0.5, 2]];
const range = (lo        , hi        ) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

export const LEVELS                           = [
  { level: 1, allowed: [0, 1, 2], maxLeap: 1, rhythms: QUARTERS },
  { level: 2, allowed: range(0, 4), maxLeap: 1, rhythms: QUARTERS },
  { level: 3, allowed: range(0, 7), maxLeap: 1, rhythms: QUARTERS },
  { level: 4, allowed: [0, 2, 4, 7], maxLeap: 4, rhythms: QUARTERS, chord: true },
  { level: 5, allowed: range(0, 7), maxLeap: 2, rhythms: QUARTERS, prefer: 2 },
  { level: 6, allowed: range(-3, 4), maxLeap: 3, rhythms: HALVES },
  { level: 7, allowed: range(-3, 7), maxLeap: 4, rhythms: HALVES, prefer: 3 },
  { level: 8, allowed: range(-3, 7), maxLeap: 5, rhythms: DOTTED },
];
