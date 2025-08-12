// Enhanced Execution Controller with Dynamic Timing
// Compatible with our existing setup

// Global execution state
let currentInterpreter = null;
let isExecuting = false;
let executionMode = 'stopped'; // 'stopped', 'fullSpeed', 'blockByBlock', 'stepping'
let stopBlockExecuted = false; // Flag to track if stop block was executed

function highlightBlock(id) {
  if (window.workspace) {
    window.workspace.highlightBlock(id);
  }
}

function showToast(message, options = {}) {
  console.log('📢 Toast:', message);
  // Use existing toast system if available
  if (window.toast && window.toast.info) {
    window.toast.info(message);
  } else if (window.toastController && window.toastController.show) {
    window.toastController.show(message, options);
  }
}

function initializeInterpreter() {
  // Use our existing code generation
  if (!window.workspace) {
    throw new Error('Workspace not available');
  }
  
  const code = Blockly.JavaScript.workspaceToCode(window.workspace);
  console.log('🔄 Generated code for execution:', code);
  
  function initApi(interpreter, globalObject) {
    // Console support
    const consoleWrapper = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
    interpreter.setProperty(globalObject, 'console', consoleWrapper);
    interpreter.setProperty(consoleWrapper, 'log', 
      interpreter.createNativeFunction(function(text) {
        console.log('🤖 Program output:', String(text));
        return true;
      })
    );

        // Santa Robot API functions - V2 Compatible
    interpreter.setProperty(globalObject, 'send_msg', interpreter.createNativeFunction(function(text) {
      console.log('Sending Santa text:', text);
      
      // Check if BLE is connected before sending
      if (!window.bleManager || !window.bleManager.isConnected) {
        console.warn('BLE device not connected - message not sent:', text);
        showToast('BLE device not connected', { duration: 3000 });
        return;
      }
      
      // Send the message using v2 compatible function
      if (window.sendSantaText) {
        window.sendSantaText(text).catch(error => {
          console.error('Error sending Santa text:', error);
          showToast('Error sending message: ' + error.message, { duration: 3000 });
        });
      }
      return text;
    }));

    interpreter.setProperty(globalObject, 'cmd_dropdown', interpreter.createNativeFunction(function(toolName, parameters) {
      // Reliable conversion using interpreter's built-in pseudoToNative (handles deep structures & arrays)
      let nativeParams;
      try {
        nativeParams = interpreter.pseudoToNative ? interpreter.pseudoToNative(parameters) : parameters;
      } catch (e) {
        console.warn('pseudoToNative conversion failed, falling back to empty object', e);
        nativeParams = {};
      }

      // Defensive: ensure plain object
      if (!nativeParams || typeof nativeParams !== 'object' || Array.isArray(nativeParams)) {
        nativeParams = nativeParams && typeof nativeParams === 'object' ? nativeParams : {};
      }

  console.log('Executing Santa command:', toolName, nativeParams);
      
      // Check if BLE is connected before sending command
      if (!window.bleManager || !window.bleManager.isConnected) {
        console.warn('BLE device not connected - command not sent:', toolName);
        showToast('BLE device not connected', { duration: 3000 });
        return;
      }
      
      // Execute the command using v2 compatible function
      if (window.executeSantaCommand) {
  window.executeSantaCommand(toolName, nativeParams).catch(error => {
          console.error('Error executing Santa command:', error);
          showToast('Error executing command: ' + error.message, { duration: 3000 });
        });
      }
      return toolName;
    }));

    // Block highlighting
    interpreter.setProperty(globalObject, 'highlightBlock',
      interpreter.createNativeFunction(function(id) {
        if (id && window.workspace) {
          const blockId = String(id);
          window.workspace.highlightBlock(blockId);
          console.log('🎯 Highlighting block:', blockId);
        }
        return true;
      })
    );

    // Math support (essential for our generated code)
    const mathWrapper = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
    interpreter.setProperty(globalObject, 'Math', mathWrapper);
    
    interpreter.setProperty(mathWrapper, 'random',
      interpreter.createNativeFunction(function() {
        return Math.random();
      })
    );
    
    interpreter.setProperty(mathWrapper, 'floor',
      interpreter.createNativeFunction(function(x) {
        return Math.floor(Number(x));
      })
    );

    // mathRandomInt helper (used in our generated code)
    interpreter.setProperty(globalObject, 'mathRandomInt',
      interpreter.createNativeFunction(function(a, b) {
        const min = Number(a);
        const max = Number(b);
        const result = Math.floor(Math.random() * (max - min + 1) + min);
        return result;
      })
    );

    // Window object with LoopTrap
    const windowWrapper = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
    interpreter.setProperty(globalObject, 'window', windowWrapper);
    interpreter.setProperty(windowWrapper, 'LoopTrap', 1000);

    // Interpreter stop method for stop blocks
    interpreter.setProperty(globalObject, 'interpreter', 
      interpreter.createObjectProto(interpreter.OBJECT_PROTO));
    interpreter.setProperty(interpreter.getProperty(globalObject, 'interpreter'), 'stop',
      interpreter.createNativeFunction(function() {
        console.log('🛑 Stop block executed');
        stopBlockExecuted = true;
        return true;
      })
    );

    // Add setVar function for variable tracking
    interpreter.setProperty(globalObject, 'setVar',
      interpreter.createNativeFunction(function(rawId) {
        const rawIdStr = String(rawId);
        console.log('🔧 setVar called with:', rawIdStr);
        
        // Extract variable information - format: blockId=variableName
        try {
          const splitIndex = rawIdStr.lastIndexOf('=');
          if (splitIndex !== -1) {
            const blockId = rawIdStr.slice(0, splitIndex);
            const variableName = rawIdStr.slice(splitIndex + 1);
            
            // Get the actual value from the interpreter's global object
            let actualValue = 'undefined';
            
            // Try to get the variable value from the global object
            try {
              const variableProperty = interpreter.getProperty(globalObject, variableName);
              if (variableProperty !== undefined) {
                // Handle JS-Interpreter values correctly
                if (variableProperty && typeof variableProperty === 'object' && 'data' in variableProperty) {
                  actualValue = variableProperty.data;
                } else if (variableProperty && typeof variableProperty === 'object' && 'toString' in variableProperty) {
                  actualValue = variableProperty.toString();
                } else {
                  // Direct primitive value
                  actualValue = variableProperty;
                }
                console.log(`📊 Variable ${variableName} = ${actualValue} (type: ${typeof actualValue}, raw: ${typeof variableProperty})`);
              } else {
                console.log(`⚠️ Variable ${variableName} not found in global scope`);
                // Try to get from the current interpreter state
                const stateStr = interpreter.stateStack && interpreter.stateStack.length > 0 ? 
                  JSON.stringify(interpreter.stateStack[0], null, 2) : 'No state';
                console.log('Current interpreter state:', stateStr);
                actualValue = 'undefined';
              }
            } catch (scopeError) {
              console.warn(`Could not access variable ${variableName}:`, scopeError);
              actualValue = 'undefined';
            }
            
            // Update variables pane
            if (typeof window.setVariableInPane === 'function') {
              window.setVariableInPane(variableName, actualValue, blockId);
            }
          } else {
            console.warn('Invalid setVar format:', rawIdStr);
          }
        } catch (error) {
          console.error('Error in setVar:', error);
        }
        
        return true;
      })
    );
  }

  currentInterpreter = new Interpreter(code, initApi);
  return currentInterpreter;
}

function runFullSpeed() {
  if (isExecuting) {
    console.warn('Code is already executing');
    return;
  }
  
  try {
    initializeInterpreter();
    isExecuting = true;
    executionMode = 'fullSpeed';
    stopBlockExecuted = false; // Reset flag
    
    // Clear any previous highlighting
    if (window.workspace) {
      window.workspace.highlightBlock(null);
    }
    
    // Hide refresh button during execution
    if (window.variablesPaneController) {
      window.variablesPaneController.hideRefreshButton();
    }
    
    console.log('🚀 Starting full speed execution...');
    showToast('Running at full speed...');
    
    while (currentInterpreter.step()) {
      // Check if stop block was executed
      if (stopBlockExecuted) {
        stopExecution();
        showToast('Program stopped by Stop block');
        console.log('🛑 Program stopped by Stop block');
        return;
      }
    }
    
    // Execution completed naturally
    stopExecution();
    showToast('Code execution completed!');
    console.log('✅ Full speed execution completed');
  } catch (error) {
    console.error('❌ Error during full speed execution:', error);
    showToast('Error during execution: ' + error.message, { duration: 5000 });
    stopExecution();
  }
}

function runBlockByBlock(timeout = 10) {
  if (isExecuting && executionMode !== 'blockByBlock') {
    console.warn('Code is already executing in a different mode');
    return;
  }
  
  if (!isExecuting) {
    initializeInterpreter();
    isExecuting = true;
    executionMode = 'blockByBlock';
    stopBlockExecuted = false; // Reset flag
    
    if (window.workspace) {
      window.workspace.highlightBlock(null);
    }
    
    // Hide refresh button during execution
    if (window.variablesPaneController) {
      window.variablesPaneController.hideRefreshButton();
    }
    
    console.log('🚀 Starting block-by-block execution...');
    showToast('Starting block-by-block execution...');
  }
  
  try {
    if (currentInterpreter.step()) {
      // Check if stop block was executed
      if (stopBlockExecuted) {
        stopExecution();
        showToast('Program stopped by Stop block');
        console.log('🛑 Program stopped by Stop block');
        return;
      }
      
      // Get dynamic timeout based on operation type
      const dynamicTimeout = getDynamicTimeout(currentInterpreter, timeout);
      setTimeout(() => runBlockByBlock(timeout), dynamicTimeout);
    } else {
      // Execution completed naturally
      stopExecution();
      showToast('Block-by-block execution completed!');
      console.log('✅ Block-by-block execution completed');
    }
  } catch (error) {
    console.error('❌ Error during block-by-block execution:', error);
    showToast('Error during execution: ' + error.message, { duration: 5000 });
    stopExecution();
  }
}

function getDynamicTimeout(interpreter, defaultTimeout) {
  // Check if we can determine the current operation type
  try {
    const stateStack = interpreter.getStateStack();
    const currentState = stateStack && stateStack.length > 0 ? stateStack[stateStack.length - 1] : null;
    
    if (!currentState || !currentState.node) {
      return defaultTimeout;
    }
    
    const node = currentState.node;
    
    // Apply delays for specific operations
    if (node.type === 'CallExpression' && node.callee) {
      const functionName = node.callee.name;
      
      switch (functionName) {
        case 'send_msg':
          return 1000; // BLE message commands - consistent with v2
        case 'cmd_dropdown':
          return getBLECommandTimeout(node, defaultTimeout);
        case 'sendSantaText':
          return 1000; // v2 async function for text
        case 'executeSantaCommand':
          return getBLECommandTimeout(node, defaultTimeout); // v2 async function for commands
        case 'highlightBlock':
          return 10; // Very quick highlight
        default:
          return defaultTimeout;
      }
    }
    
    // Different delays for different statement types
    switch (node.type) {
      case 'WhileStatement':
      case 'ForStatement':
        return Math.min(defaultTimeout, 50); // Much faster for loops
      case 'IfStatement':
        return Math.min(defaultTimeout, 50); // Much faster for conditionals
      case 'VariableDeclaration':
      case 'AssignmentExpression':
        return Math.min(defaultTimeout, 30); // Very fast for assignments
      default:
        return defaultTimeout;
    }
  } catch (error) {
    console.log('Could not determine dynamic timeout, using default');
    return defaultTimeout;
  }
}

function getBLECommandTimeout(node, defaultTimeout) {
  // All BLE commands get 1000ms timeout
  return 1000;
}

function stepOnce() {
  if (isExecuting && executionMode !== 'stepping') {
    console.warn('Code is already executing in a different mode');
    return;
  }
  
  if (!isExecuting) {
    initializeInterpreter();
    isExecuting = true;
    executionMode = 'stepping';
    stopBlockExecuted = false; // Reset flag
    
    if (window.workspace) {
      window.workspace.highlightBlock(null);
    }
    
    // Hide refresh button during execution
    if (window.variablesPaneController) {
      window.variablesPaneController.hideRefreshButton();
    }
    
    console.log('🚀 Starting step-by-step execution...');
    showToast('Starting step-by-step execution...');
  }
  
  try {
    if (currentInterpreter.step()) {
      // Check if stop block was executed
      if (stopBlockExecuted) {
        stopExecution();
        showToast('Program stopped by Stop block');
        console.log('🛑 Program stopped by Stop block');
        return;
      }
      
      showToast('Step executed. Click Step Once again to continue.');
      console.log('👣 Step executed, waiting for next step...');
    } else {
      stopExecution();
      showToast('Step execution completed!');
      console.log('✅ Step execution completed');
    }
  } catch (error) {
    console.error('❌ Error during step execution:', error);
    showToast('Error during execution: ' + error.message, { duration: 5000 });
    stopExecution();
  }
}

function stopExecution() {
  isExecuting = false;
  executionMode = 'stopped';
  currentInterpreter = null;
  stopBlockExecuted = false; // Reset flag
  
  // Clear any highlighting
  if (window.workspace) {
    window.workspace.highlightBlock(null);
  }
  
  // Show refresh button when execution stops
  if (window.variablesPaneController) {
    window.variablesPaneController.showRefreshButton();
  }
  
  console.log('⏹️ Execution stopped');
  
  // Update UI state if function exists
  if (window.updateExecutionUI) {
    window.updateExecutionUI();
  }
}

function resetExecution() {
  stopExecution();
  showToast('Execution reset!');
  console.log('🔄 Execution reset');
}

// Expose functions globally for compatibility with existing setup
window.runFullSpeed = runFullSpeed;
window.runBlockByBlock = runBlockByBlock;
window.stepOnce = stepOnce;
window.stopExecution = stopExecution;
window.resetExecution = resetExecution;
window.isExecuting = () => isExecuting;
window.getExecutionMode = () => executionMode;

// Also expose the individual functions used by our existing interpreter
window.initializeInterpreter = initializeInterpreter;
window.highlightBlock = highlightBlock;

console.log('🎮 Enhanced Execution Controller loaded with dynamic timing');
