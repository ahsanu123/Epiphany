import { EditorState, Plugin, Selection } from "prosemirror-state"
import { EditorView, Decoration, DecorationSet } from "prosemirror-view"
import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import './style.css'
import { baseKeymap, setBlockType } from "prosemirror-commands"

import textSchema from "./textschema"
import SlashMenuView from "./slashmenuview"

export default function menuPlugin() {

    const pluginKey = { key: 'menuplugin' }
    const defaultTriggerCharacter = '\\'

    // Plugin key is passed in as a parameter, so it can be exported and used in the DraggableBlocksPlugin.
    return new Plugin({
        key: pluginKey,

        view: (view) => {
            return new SlashMenuView(pluginKey.key, view);
        },
        state: {
            // Initialize the plugin's internal state.
            init() {
                return {
                    active: false,
                    triggerCharacter: null,
                    decorationId: 0,
                    keyboardHoveredItemIndex: 0
                };
            },

            // Apply changes to the plugin state from an editor transaction.
            apply(transaction, prev, oldState, newState) {
                //step 2
                // Checks if the menu should be shown.
                if (transaction.getMeta(pluginKey) && transaction.getMeta(pluginKey).activate) {
                    return {
                        active: true,
                        triggerCharacter:
                            transaction.getMeta(pluginKey).triggerCharacter || "",
                        queryStartPos: newState.selection.from,
                        /* items: items(""),*/
                        keyboardHoveredItemIndex: 0,
                        // TODO: Maybe should be 1 if the menu has no possible items? Probably redundant since a menu with no items
                        //  is useless in practice.
                        //  notFoundCount: 0,
                        decorationId: `id_${Math.floor(Math.random() * 0xffffffff)}`,
                    };
                }

                // Checks if the menu is hidden, in which case it doesn't need to be hidden or updated.
                if (!prev.active) {
                    return prev;
                }

                if (transaction.getMeta(pluginKey).selectedItemIndexChanged !== undefined) {
                    let newIndex =
                        transaction.getMeta(pluginKey).selectedItemIndexChanged;

                    // Allows selection to jump between first and last items.
                    if (newIndex < 0) {
                        newIndex = 9;
                    } else if (newIndex >= 10) {
                        newIndex = 0;
                    }

                    prev.keyboardHoveredItemIndex = newIndex;
                }

                return prev;
            },
        },

        props: {
            handleKeyDown(view, event) {
                const menuIsActive = this.getState(view.state).active;
                // step 1.
                // Shows the menu if the default trigger character was pressed and the menu isn't active.
                if (event.key === defaultTriggerCharacter && !menuIsActive) {
                    view.dispatch(
                        view.state.tr
                            .insertText(defaultTriggerCharacter)
                            .scrollIntoView()
                            .setMeta(pluginKey, {
                                activate: true,
                                triggerCharacter: defaultTriggerCharacter,
                            })
                    );

                    return true;
                }
                // Doesn't handle other keystrokes if the menu isn't active.
                if (!menuIsActive) {
                    return false;
                }

                // Handles keystrokes for navigating the menu.
                const {
                    triggerCharacter,
                    queryStartPos,
                    keyboardHoveredItemIndex
                } = this.getState(view.state);

                // Moves the keyboard selection to the previous item.
                if (event.key === "ArrowUp") {

                    view.dispatch(
                        view.state.tr.setMeta(pluginKey, {
                            selectedItemIndexChanged: keyboardHoveredItemIndex - 1,
                        })
                    );
                    return true;
                }

                // Moves the keyboard selection to the next item.
                if (event.key === "ArrowDown") {
                    view.dispatch(
                        view.state.tr.setMeta(pluginKey, {
                            selectedItemIndexChanged: keyboardHoveredItemIndex + 1,
                        })
                    );
                    return true;
                }
                return false;
                // Selects an item and closes the menu.
                if (event.key === "Enter") {
                    deactivate(view);
                    selectItemCallback({
                        item: items[keyboardHoveredItemIndex],
                        editor: editor,
                        range: {
                            from: queryStartPos - triggerCharacter.length,
                            to: view.state.selection.from,
                        },
                    });
                    return true;
                }

                // Closes the menu.
                if (event.key === "Escape") {
                    deactivate(view);
                    return true;
                }

                return false;
            },

            // Hides menu in cases where mouse click does not cause an editor state change.
            handleClick(view) {
                // deactivate(view);
            },

            // Setup decorator on the currently active suggestion.
            decorations(state) {
                console.log(this.getState(state))
                // step3
                const { active, decorationId, queryStartPos, triggerCharacter } = this.getState(state);

                if (!active) {
                    return null;
                }
                //setup
                // If the menu was opened programmatically by another extension, it may not use a trigger character. In this
                // case, the decoration is set on the whole block instead, as the decoration range would otherwise be empty.
                if (triggerCharacter === "") {
                    const blockNode = findBlock(state.selection);
                    if (blockNode) {
                        return DecorationSet.create(state.doc, [
                            Decoration.node(
                                blockNode.pos,
                                blockNode.pos + blockNode.node.nodeSize,
                                {
                                    nodeName: "span",
                                    class: "suggestion-decorator",
                                    "data-decoration-id": decorationId,
                                }
                            ),
                        ]);
                    }
                }
                // Creates an inline decoration around the trigger character.
                return DecorationSet.create(state.doc, [
                    Decoration.inline(
                        queryStartPos - triggerCharacter.length,
                        queryStartPos,
                        {
                            nodeName: "span",
                            class: "suggestion-decorator",
                            "data-decoration-id": decorationId,
                        }
                    ),
                ]);
            },
        },
    });

}