import { keymap } from "prosemirror-keymap"
import { Transform, StepMap } from "prosemirror-transform"
import { EditorState, Plugin, Selection, NodeSelection } from "prosemirror-state"
import { EditorView, Decoration, DecorationSet } from "prosemirror-view"
import { Schema, DOMParser } from "prosemirror-model"
import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import './style.css'
import { baseKeymap, setBlockType } from "prosemirror-commands"
import TagsView from "./tags"
import GalleryView from "./gallery"
import EquationView from "./equation"
import { gapCursor } from "prosemirror-gapcursor"
import textSchema from "./textschema"
import EquationManager from "./equation_manager"
import InlineEquationView from "./inline_equation"
import EquationRefView from "./equation_ref"
import VideoView from "./video"
import TwitterView from "./twitter"
import { undo, redo, history } from "prosemirror-history"
import { buildKeymap } from "./keymap"
import { dropCursor } from "prosemirror-dropcursor"
import CodeBlockView from "./code"
import limpidPlugin from "./limpid_plugin"
import trailingSpacePlugin from "./trailing_space_plugin"
import { Tree } from "./tree"
import menuPlugin from "./slashmenu"
import formatterPlugin from "./formatter_view"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { findParentNode } from "@tiptap/core";
import UpdateTimer from "./update_timer"

//https://pictogrammers.com/library/mdi/

dayjs.extend(relativeTime)

let equationManager = new EquationManager();

function arrowHandler(dir) {
  return (state, dispatch, view) => {
    if (state.selection.empty && view.endOfTextblock(dir)) {
      let side = dir == "left" || dir == "up" ? -1 : 1
      let $head = state.selection.$head
      let nextPos = Selection.near(
        state.doc.resolve(side > 0 ? $head.after() : $head.before()), side)
      if (nextPos.$head && nextPos.$head.parent.type.name == "code_block") {
        dispatch(state.tr.setSelection(nextPos))
        return true
      }
    }
    return false
  }
}

let editorElm = document.querySelector("#editor");
let updateContentTimer = null;

function scrollHeadingIntoViewById(id) {
  window.editorView.state.doc.forEach((node, offset, index) => {
    if (node.type.name === 'heading' && node.attrs.id === id) {
      let ns = NodeSelection.create(window.editorView.state.doc, offset);
      window.editorView.focus();
      let tr = window.editorView.state.tr.setSelection(ns).scrollIntoView();
      window.editorView.dispatch(tr);
      return false;
    }
  })
}

function updateContent() {
  let containerElem = document.getElementById('toc-container-list');

  while (containerElem.firstChild) {
    containerElem.removeChild(containerElem.firstChild);
  }

  let indentation = 0;
  let currentLevel = 2;
  for (let i = 0; i < window.editorView.state.doc.content.content.length; ++i) {
    let node = window.editorView.state.doc.content.content[i];
    if (node.type.name === 'heading') {

      if (node.attrs.level > currentLevel) {
        indentation += 10;
        currentLevel = node.attrs.level;
      }
      else if (node.attrs.level < currentLevel) {
        indentation -= 10;
        currentLevel = node.attrs.level;
      }

      let elem = document.createElement('div');
      elem.classList.add('toc-container-item');
      const id = node.attrs.id;
      elem.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          scrollHeadingIntoViewById(id);
        }, 100);
      }
      console.log("update toc item", node.attrs.id)
      elem.style.paddingLeft = (16 + indentation) + 'px';
      let span = document.createElement('span');
      span.innerText = node.textContent;
      elem.appendChild(span);
      containerElem.appendChild(elem);
    }
  }
}

const arrowHandlers = keymap({
  ArrowLeft: arrowHandler("left"),
  ArrowRight: arrowHandler("right"),
  ArrowUp: arrowHandler("up"),
  ArrowDown: arrowHandler("down")
})

const findHeading = findParentNode(
  (node) => node.type.name === "heading"
);


const before = Math.floor(Date.now() / 1000) - 3600 * 34;
const updateTimer = new UpdateTimer(document.getElementById('editor-top-doc-time'), before);

let docUpdateDelay = null;

window.editorView = new EditorView(editorElm, {
  state: EditorState.create({
    doc: DOMParser.fromSchema(textSchema).parse('<h1>test</h1><tags></tags><p>test</p>'),
    plugins: [
      menuPlugin(equationManager),
      formatterPlugin(),
      keymap(buildKeymap(textSchema)),
      keymap(baseKeymap),
      arrowHandlers,
      gapCursor(),
      dropCursor(),
      limpidPlugin(equationManager),
      trailingSpacePlugin(),
      history()
    ]
  }),
  nodeViews: {
    tags(node, view, getPos) { return new TagsView(node, view, getPos); },
    gallery(node, view, getPos) { return new GalleryView(node, view, getPos); },
    equation(node, view, getPos) { return new EquationView(node, view, getPos, equationManager); },
    inline_equation(node, view, getPos) { return new InlineEquationView(node, view, getPos); },
    equation_ref(node, view, getPos) {
      return new EquationRefView(node, view, getPos, equationManager);
    },
    video(node, view, getPos) {
      return new VideoView(node, view, getPos);
    },
    twitter(node, view, getPos) {
      return new TwitterView(node, view, getPos);
    },
    code_block(node, view, getPos) { return new CodeBlockView(node, view, getPos); }
  },
  dispatchTransaction: (tr) => {
    const state = window.editorView.state.apply(tr);
    window.editorView.updateState(state);

    if (tr.steps.length == 0) {
      return;
    }

    function rebuildContentTable() {
      if (updateContentTimer) {
        clearTimeout(updateContentTimer);
        updateContentTimer = null;
      }

      updateContentTimer = setTimeout(() => {
        updateContentTimer = null;
        updateContent();
      }, 3000);
    }

    function notifyTimerDocumentUpdate() {
      if (docUpdateDelay) {
        clearTimeout(docUpdateDelay);
        docUpdateDelay = null;
      }

      docUpdateDelay = setTimeout(() => {
        docUpdateDelay = null;
        const now = Math.floor(Date.now() / 1000);
        updateTimer.documentUpdated(now);
      }, 3000);
    }

    notifyTimerDocumentUpdate();

    for (let i = 0; i < tr.steps.length; ++i) {
      if (tr.steps[i].slice) {
        if (!tr.steps[i].slice.content || tr.steps[i].slice.content.size == 0) {
          rebuildContentTable();
          return;
        }

        for (let e = 0; e < tr.steps[i].slice.content.content.length; ++e) {
          let node = tr.steps[i].slice.content.content[e];
          if (node.type.name === 'heading') {
            rebuildContentTable();
            return;
          }
          else if (node.type.name === 'text') {
            const headingNode = findHeading(tr.selection)
            if (headingNode) {
              rebuildContentTable();
              return;
            }
          }
        }
      }
    }


  }
})

editorElm.onclick = (e) => {
  if (e.target !== editorElm) {
    return;
  }
  e.preventDefault();


  let lastNode = window.editorView.state.doc.lastChild;
  let rpos = window.editorView.state.doc.resolve(window.editorView.state.doc.nodeSize - 2);
  let selection = Selection.near(rpos, 1)
  let tr = window.editorView.state.tr.setSelection(selection).scrollIntoView()
  setTimeout(() => {
    window.editorView.dispatch(tr)
    window.editorView.focus()
  }, 100);

  e.stopImmediatePropagation();
  e.stopPropagation();
}

function getDraggableBlockFromCoords(
  coords,
  view
) {
  let pos = view.posAtCoords(coords);
  if (!pos) {
    return undefined;
  }
  let node = view.domAtPos(pos.pos).node;

  if (node === view.dom) {
    // mouse over root
    return undefined;
  }

  while (
    node &&
    node.parentNode &&
    node.parentNode !== view.dom &&
    !node.hasAttribute("data-id")
  ) {
    node = node.parentNode;
  }
  if (!node) {
    return undefined;
  }
  return { node, id: node.getAttribute("data-id") };
}

document.body.addEventListener(
  "mousemove",
  (event) => {
    return;
    /*if (this.menuFrozen) {
      return;
    }*/

    // Editor itself may have padding or other styling which affects size/position, so we get the boundingRect of
    // the first child (i.e. the blockGroup that wraps all blocks in the editor) for a more accurate bounding box.
    const editorBoundingBox = window.editorView.dom.firstChild.getBoundingClientRect();

    let horizontalPosAnchor = editorBoundingBox.x;

    // Gets block at mouse cursor's vertical position.
    const coords = {
      left: editorBoundingBox.left + editorBoundingBox.width / 2, // take middle of editor
      top: event.clientY,
    };
    const block = getDraggableBlockFromCoords(coords, window.editorView);

    // Closes the menu if the mouse cursor is beyond the editor vertically.
    if (!block) {
      /*if (this.menuOpen) {
        this.menuOpen = false;
        this.blockMenu.hide();
      }
*/
      return;
    }

    // Doesn't update if the menu is already open and the mouse cursor is still hovering the same block.
    /*if (
      this.menuOpen &&
      this.hoveredBlockContent?.hasAttribute("data-id") &&
      this.hoveredBlockContent?.getAttribute("data-id") === block.id
    ) {
      return;
    }*/

    // Gets the block's content node, which lets to ignore child blocks when determining the block menu's position.


    const blockContent = block.node.firstChild;
    let hoveredBlockContent = blockContent;


    console.log("mouse hover block", window.editorView.posAtDOM(blockContent, 0));
    console.log("maybe child", window.editorView.state.doc.nodeAt(window.editorView.posAtDOM(blockContent, 0) - 1))
    if (!blockContent) {
      return;
    }

    // Shows or updates elements.
    /*if (!this.menuOpen) {
      this.menuOpen = true;
      this.blockMenu.render(this.getDynamicParams(), true);
    } else {
      this.blockMenu.render(this.getDynamicParams(), false);
    }*/

  },
  true
);

/*const { invoke } = window.__TAURI__.tauri;

let greetInputEl;
let greetMsgEl;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}*/

const data = {
  children: [
    {
      name: 'fruits', children: [
        { name: 'apples', children: [] },
        {
          name: 'oranges', children: [
            { name: 'tangerines', children: [] },
            { name: 'mandarins', children: [] },
            { name: 'pomelo', children: [] },
            { name: 'blood orange', children: [] },
          ]
        }
      ]
    },
    {
      name: 'vegetables', children: [
        { name: 'brocolli', children: [] },
      ]
    },
  ]
}

const tree = new Tree(data, { parent: document.getElementById('tree-container') })

//document.getElementById('editor-top-doc-time').innerText = dayjs('2023-02-10').fromNow();

let menuFolded = false;

document.getElementById('fold-menu-button').onclick = (e) => {
  if (!menuFolded) {
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('fold-menu-button').innerText = 'g';
    menuFolded = true;
    document.getElementById('editor-top-padding').style.display = 'inline-block';
  }
  else {
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('fold-menu-button').innerText = 'h';
    menuFolded = false;
    document.getElementById('editor-top-padding').style.display = 'none';
  }
}