'use strict';
import * as vscode from 'vscode';
import { setTimeout } from 'timers';

function exchangeSelectionStartAndEnd(editor, selections) {
  let newSelections = [];
  for (let i = 0; i < selections.length; i++) {
    let selection = selections[i];
    let start, end;
    if (selection.isReversed) {
      start = selection.start;
      end = selection.end;
    } else {
      start = selection.end;
      end = selection.start;
    }
    newSelections.push(
      new vscode.Selection(start.line, start.character, end.line, end.character)
    );
  }
  editor.selections = newSelections;
}

function extendSelection(editor, selections) {
  vscode.window
    .showInputBox({
      prompt: '🡅 will extend the selection. You can specify [prefix]|[suffix].'
    })
    .then(extendWithText => {
      if (extendWithText) {
        let parts = extendWithText.split(/\|/);
        if (parts.length === 1) {
          extendSelectionImpl(editor, selections, parts[0]);
        } else {
          let [partA, partB, ...superflueous] = parts;
          partA = partA || '';
          partB = partB || '';
          if (selections[0].active.isAfterOrEqual(selections[0].anchor)) {
            extendSelectionImpl(editor, selections, partB);
            if (partA.length > 0) {
              setTimeout(() => {
                exchangeSelectionStartAndEnd(editor, editor.selections);
                setTimeout(() => {
                  extendSelectionImpl(editor, editor.selections, partA);
                  setTimeout(() => {
                    exchangeSelectionStartAndEnd(editor, editor.selections);
                  }, 50);
                }, 50);
              }, 50);
            }
          } else {
            extendSelectionImpl(editor, editor.selections, partA);
            if (partB.length > 0) {
              setTimeout(() => {
                exchangeSelectionStartAndEnd(editor, editor.selections);
                setTimeout(() => {
                  extendSelectionImpl(editor, editor.selections, partB);
                  setTimeout(() => {
                    exchangeSelectionStartAndEnd(editor, editor.selections);
                  }, 50);
                }, 50);
              }, 50);
            }
          }
        }
      }
    });
}

function extendSelectionImpl(editor, selections, extendWithText) {
  if (extendWithText) {
    const extendWithTextLength = extendWithText.length;
    editor.edit(editBuilder => {
      for (let i = selections.length - 1; i > -1; i--) {
        let selection = selections[i];
        editBuilder.insert(selection.active, extendWithText);
      }
    });
    setTimeout(() => {
      selections = editor.selections;
      let newSelections = [];
      for (let i = selections.length - 1; i > -1; i--) {
        let selection = selections[i];
        if (selection.active.isBeforeOrEqual(selection.anchor)) {
          newSelections.push(
            new vscode.Selection(
              selection.anchor.line,
              selection.anchor.character,
              selection.active.line,
              selection.active.character - extendWithTextLength
            )
          );
        } else {
          newSelections.push(selection);
        }
      }
      editor.selections = newSelections;
    }, 40);
  }
}

function columnSelectionMode(editor, selection) {
  let startPosition = selection.start;
  let endPosition = selection.end;
  let reversed = selection.isReversed;
  let newSelections = [];
  let linesInSelectionSpan = endPosition.line - startPosition.line + 1;
  if (linesInSelectionSpan < 2) {
    return;
  }

  editor.edit(editBuilder => {
    // Create a new selection for each line that the currentSelection spans
    for (let i = 0; i < linesInSelectionSpan; i++) {
      const lineNumber = startPosition.line + i;

      const config = vscode.workspace.getConfiguration(
        'exchangeSelectionStartAndEnd'
      );
      if (config) {
        switch (config.get('columnSelectionMode')) {
          case 'short':
            // short lines are included, this is default
            break;
          case 'partial':
            // shorter lines skipped
            if (
              editor.document.lineAt(lineNumber).range.end.character <
              startPosition.character
            ) {
              continue;
            }
            break;
          case 'partial+pad':
            // shorter lines skipped, partial lines padded to make full
            if (
              editor.document.lineAt(lineNumber).range.end.character <
              startPosition.character
            ) {
              continue;
            }
          // fall thru
          case 'short+pad':
            // pad lines
            if (
              editor.document.lineAt(lineNumber).range.end.character <
              endPosition.character
            ) {
              editBuilder.insert(
                editor.document.lineAt(lineNumber).range.end,
                ' '.repeat(
                  endPosition.character -
                    editor.document.lineAt(lineNumber).range.end.character
                )
              );
            }
            break;
          case 'full':
            // partial lines skipped
            if (
              editor.document.lineAt(lineNumber).range.end.character <
              endPosition.character
            ) {
              continue;
            }
            break;
        }
      }

      if (reversed) {
        newSelections.push(
          new vscode.Selection(
            lineNumber,
            endPosition.character,
            lineNumber,
            startPosition.character
          )
        );
      } else {
        newSelections.push(
          new vscode.Selection(
            lineNumber,
            startPosition.character,
            lineNumber,
            endPosition.character
          )
        );
      }
    }
  });
  setTimeout(() => {
    editor.selections = newSelections;
  }, 50);
}

function contiguousSelectionMode(editor, selections) {
  // Convert to single contigeous selection
  if (selections[0].isReversed) {
    editor.selection = new vscode.Selection(
      selections[selections.length - 1].end,
      selections[0].start
    );
  } else {
    editor.selection = new vscode.Selection(
      selections[0].start,
      selections[selections.length - 1].end
    );
  }
}

function activate(context) {
  let disposable = vscode.commands.registerCommand(
    'exchangeSelectionStartAndEnd.exchange',
    function() {
      const editor = vscode.window.activeTextEditor;
      const selections = editor.selections;
      if (selections && selections.length > 0) {
        exchangeSelectionStartAndEnd(editor, selections);
      }
    }
  );

  context.subscriptions.push(disposable);
  disposable = vscode.commands.registerCommand(
    'exchangeSelectionStartAndEnd.extendSelection',
    function() {
      const editor = vscode.window.activeTextEditor;
      const selections = editor.selections;
      if (selections && selections.length > 0) {
        extendSelection(editor, selections);
      }
    }
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'exchangeSelectionStartAndEnd.toggleSelectionMode',
    function() {
      const editor = vscode.window.activeTextEditor;
      const selections = editor.selections;
      if (selections && selections.length > 1) {
        contiguousSelectionMode(editor, selections);
      } else if (selections && selections.length === 1) {
        columnSelectionMode(editor, selections[0]);
      }
    }
  );
  context.subscriptions.push(disposable);

  const eventSubscription = vscode.workspace.onDidChangeConfiguration(
    setStatus
  );

  context.subscriptions.push(eventSubscription);

  // Create as needed
  if (!_statusBarItem) {
    const editor = vscode.window.activeTextEditor;
    _statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    _statusBarItem.tooltip = 'Column Selection Mode';
    setStatus();
    _statusBarItem.show();
  }
}

function setStatus() {
  let csm = '';
  const config = vscode.workspace.getConfiguration(
    'exchangeSelectionStartAndEnd'
  );
  if (config && config.get('columnSelectionMode')) {
    csm = config.get('columnSelectionMode');
  } else {
    csm = 'short';
  }
  _statusBarItem.text = 'CSM: ' + csm;
  _statusBarItem.color = new vscode.ThemeColor(
    isValid(csm) ? 'statusBar.foreground' : 'errorForeground'
  );
}

function isValid(csm): boolean {
  const csms = ['short', 'short+pad', 'partial', 'partial+pad', 'full'];
  return csms.indexOf(csm) !== -1;
}

let _statusBarItem;

function deactivate() {
  _statusBarItem = null;
}

exports.activate = activate;
exports.deactivate = deactivate;
