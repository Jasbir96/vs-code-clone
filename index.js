var $ = jQuery = require('jquery')
require('jquery-ui-dist/jquery-ui');
require('jstree');

const fs = require('fs');
const nodePath = require('path');
const os = require('os');
const pty = require('node-pty');
const { FitAddon } = require("xterm-addon-fit");

let currPath;
let db;
let editor;
let defaultValue = "function hello() {\n\talert('Hello world!');\n}";
let defaultName = 'utilited';
let lcTab = [];
let lcFolder;

$(document).ready(async function () {
    // xterm integration
    // no logic just copy paste code from https://github.com/microsoft/node-pty/blob/master/examples/electron/renderer.js
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'];
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cwd: process.cwd(),
        env: process.env
    });

    // Initialize xterm.js and attach it to the DOM
    const xterm = new Terminal({
        convertEol: true,
        fontSize: 12,
        cursorBlink: true,
        rendererType: "dom",
        fontWeightBold: true

        // default is canvas
    });
    xterm.setOption('theme', {
        background: "#764ba2",
        foreground: "white",
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(document.getElementById('terminal'));
    fitAddon.fit()
    // Setup communication between xterm.js and node-pty
    xterm.onData(data => ptyProcess.write(data));
    ptyProcess.on('data', function (data) {
        xterm.write(data);
    });

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    //monaco editor integration 
    editor = await getMonacoPromise();
    console.log(editor)

    //make divs resizeable
    // $('#explorer-window').resizable();
    // $('#terminal').resizable();

    //make tabs on top
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    let tabs = $("#tabs").tabs({
        collapsible: true,
        active: false,
        heightStyle: "fill"
    });

    // Close icon: removing the tab on click
    tabs.on("click", ".ui-icon-close", function () {
        // console.log(db.length);
        if (lcTab.length <= 1) {
            return;
        }

        var panelId = parseInt($(this).closest("li").remove().attr("aria-controls"));
        console.log(panelId);
        $("#" + panelId).remove();
        tabs.tabs("refresh");

        let idx = lcTab.indexOf(panelId);
        console.log('idx is ' + idx);
        if (lcTab[lcTab.length - 1] == panelId) {
            let newTabId = lcTab[lcTab.length - 2];
            editor.setValue(db[newTabId].data);
        }
        console.log('removing idx ' + idx);
        lcTab.splice(idx, 1);
        delete db[panelId];

        window.event.stopImmediatePropagation();
    });
    tabs.on("click", ".ui-tabs-tab", function () {
        $('.ui-tabs-tab').attr("aria-selected", false);

        if ($(window.event.srcElement).hasClass('ui-icon-close')) {
            return;
        }
        let tabId = parseInt($(this).find("a").attr('href').substr(1));
        console.log(tabId);

        editor.setValue(db[tabId].data)

        let tabIdx = lcTab.indexOf(tabId);
        if (tabIdx != -1) {
            lcTab.splice(tabIdx, 1);
        }
        lcTab.push(tabId);

    })

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    editor.onDidBlurEditorText(function () {

        let ltab = lcTab[lcTab.length - 1];
        db[ltab].data = editor.getValue();

    });

    //basic setup
    db = {};
    openFile();

    //explorer tree code
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    currPath = process.argv[6].split('=')[1];
    lcFolder = currPath;

    let data = [];
    data.push({
        id: currPath,
        parent: '#',
        text: getName(currPath)
    })

    data = data.concat(getCurrentDirectories(currPath));
    $('#content').jstree({
        "core": {
            data: data,
            "check_callback": true,

            themes: { dots: false, "icons": false, }

        }
    }).on("open_node.jstree", function (e, data) {
        data.node.children.forEach(function (child) {
            let directories = getCurrentDirectories(child);
            directories.forEach(function (directory) {
                let temp = $('#content').jstree().create_node(child, directory, "last");
            })
        })
        lcFolder = data.node.id;

    }).on('changed.jstree', function (e, data) {

        if (fs.lstatSync(data.selected[0]).isFile()) {
            openFile(data.selected[0]);
            console.log(lcTab);
        }

    })

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    $('#new').on('click', function () {
        openFile();
    })


    function openFile(path) {

        let fileName = (path === undefined) ? defaultName : getName(path);
        let tabId = Object.keys(db).length + 1;
        lcTab.push(tabId);

        let tabTemplate = "<li><a href='#{href}'>#{label}</a> <span class='ui-icon ui-icon-close' role='presentation'>Remove Tab</span></li>";
        let li = $(tabTemplate.replace(/#\{href\}/g, "#" + tabId).replace(/#\{label\}/g, fileName));

        tabs.find(".ui-tabs-nav").append(li);
        tabs.append("<div id='" + tabId + "'></div>");
        tabs.tabs("refresh");


        let fileData = (path === undefined) ? updateEditor() : updateEditor(path);

        db[tabId] = {
            path: path === undefined ? 'new' : path,
            data: fileData
        };
    }

    function updateEditor(path) {

        if (path === undefined) {
            editor.setValue(defaultValue);
            monaco.editor.setModelLanguage(editor.getModel(), 'javascript');
            return defaultValue;
        }

        let fileData = fs.readFileSync(path).toString();
        editor.setValue(fileData);
        let lang = getName(path).split('.')[1];

        if (lang === 'js') {
            lang = 'javascript';
        }
        console.log(lang);
        monaco.editor.setModelLanguage(editor.getModel(), lang);
        return fileData;
    }
})

function getCurrentDirectories(path) {

    if (fs.lstatSync(path).isFile()) {
        return [];
    }

    let files = fs.readdirSync(path);

    let rv = [];
    files.forEach(function (file) {
        rv.push({
            id: nodePath.join(path, file),
            parent: path,
            text: file
        });
    })

    return rv;
}

//get file name from path
function getName(path) {
    return path.replace(/^.*[\\\/]/, '');
}

//monaco editor integration promise
//made mloader and used its require bcoz monaco changes node require.
function getMonacoPromise() {
    return new Promise(function (resolve, reject) {
        var mloader = require('./node_modules/monaco-editor/dev/vs/loader.js');
        mloader.require.config({ paths: { 'vs': './node_modules/monaco-editor/dev/vs' } });
        mloader.require(['vs/editor/editor.main'], function (a) {
            monaco.editor.defineTheme('myTheme', {
                base: 'vs-dark',
                inherit: true,
                rules: [{ background: '#1e2024' }],
                "colors": {
                    "editor.foreground": "#F8F8F8",
                    "editor.background": "#1e2024",
                    "editor.selectionBackground": "#DDF0FF33",
                    "editor.lineHighlightBackground": "#FFFFFF08",
                    "editorCursor.foreground": "#A7A7A7",
                    "editorWhitespace.foreground": "#FFFFFF40"
                }
            });
            monaco.editor.setTheme('myTheme');
            let editor = monaco.editor.create(document.getElementById('text-editor'), {
                value: "",
                language: 'javascript',
                theme: "myTheme"
            });
            resolve(editor);
        });
    });
}