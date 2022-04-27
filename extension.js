const vscode = require('vscode');
const util = require('util');
var path = require('path');

let DEBUG_ON_REMOTE = false;

function genCscopeCmd(rawCmd) {
	if (DEBUG_ON_REMOTE) {
		return `ssh dev-dsk-dkinsb-1b-66d7b3dd.eu-west-1.amazon.com "cd /home/dkinsb/code/perftest && ${rawCmd}"`;
	} else {
		return rawCmd;
	}
}

const exec = util.promisify(require('child_process').exec);

async function build() {
	vscode.window.showInformationMessage('Started Building');
	let CMD = genCscopeCmd('cscope -Rb');
	console.log('build CMD:', CMD);
	const { stdout, stderr } = await exec(CMD, {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath});
	console.log("stdout:", stdout);
	console.log("stderr:", stderr);
	vscode.window.showInformationMessage('Done Building');
}

class Node {
	constructor() {
		this.children = []
		this.fileName = '';
	}
	add(node) {
		this.children.push(node);
	}
	getChildren() {
		return this.children;
	}
}

class SymbolNode extends Node {
    constructor(symbol, funcName, fileName, pos, code) {
		super();
		this.symbol = symbol;
        this.funcName = funcName;
        this.fileName = fileName;
        this.pos = pos;
        this.code = code;

    }

	getChildren() {
		return getCallers(this.funcName);
	}
}

class DeclNode extends Node {
    constructor(symbol, fileName, pos, code) {
		super();
		this.symbol = symbol;
        this.fileName = fileName;
        this.pos = pos;
        this.code = code;
    }
	getChildren() {
		return getCallers(this.symbol);
	}
}

class DefNode extends Node {
    constructor(symbol, fileName, pos, code) {
		super();
		this.symbol = symbol;
        this.fileName = fileName;
        this.pos = pos;
        this.code = code;
    }
	getChildren() {
		return getCallers(this.symbol);
	}
}


class FileNode extends Node {
	constructor(fileName) {
		super();
		this.fileName = fileName;
		}
	}
   
class SearchNode extends Node {
	constructor(symbol, fileName, pos) {
		super();
		this.symbol = symbol;
		this.fileName = fileName;
		this.pos = pos;
	}
	getChildren() {
		return getCallers(this.symbol);
	}
}



class NodeTreeItem extends vscode.TreeItem {
	constructor (node, gotoSrcCmd) {
		super( "", vscode.TreeItemCollapsibleState.Collapsed);
		this.node = node;
		this.label = this.getLabel();
		this.description = this.getDescription();

		if (gotoSrcCmd) {
			this.command = {
				command: 'calltree.gotoSrc',
				arguments: [this.node.fileName, this.node.pos],
				title: 'goto source'
			};
		}
	}

	getLabel() {
		return "label";
	}

	getDescription() {
		return "desc";
	}
}

class SymbolNodeTreeItem extends NodeTreeItem {
    constructor(node) {
        super(node, true);
		this.iconPath = {
			dark: vscode.Uri.joinPath(extensionUri, "resources", "arrow-dark.png"),
			light: vscode.Uri.joinPath(extensionUri, "resources", "arrow-light.png"),
		  }
    }
	getDescription() {
		let filePos = `${this.node.fileName} : ${this.node.pos}`
		return filePos;
		// return ` [${filePos}] >>> ${this.node.code}`;
		// return `${this.node.fileName} : ${this.node.pos}`;
	}
	
	getLabel() {
		let label = `${this.node.funcName}()`;
		return {label:`${label}: ${this.node.code}`, highlights:[[0, label.length]]};
		// let label = `${this.node.funcName}(): ${this.node.code}`;
		// let first = label.indexOf(this.node.symbol);
		// let last = first + this.node.symbol.length;
		// return {label: label, highlights:[[first, last]]};

	}
}

class DeclNodeTreeItem extends NodeTreeItem {
    constructor(node) {
        super(node, true);
		this.iconPath = {
			dark: vscode.Uri.joinPath(extensionUri, "resources", "h-dark.png"),
			light: vscode.Uri.joinPath(extensionUri, "resources", "h-light.png"),
		  }
    }
	getLabel() {
		let first = this.node.code.indexOf(this.node.symbol);
		let last = first + this.node.symbol.length;
		return {label: this.node.code, highlights:[]};
		// return {label: this.node.code, highlights:[[first, last]]};
	}
	
	getDescription() {
		return `${this.node.fileName} : ${this.node.pos}`;
	}
}
class DefNodeTreeItem extends NodeTreeItem {
    constructor(node) {
        super(node, true);
		this.iconPath = {
			dark: vscode.Uri.joinPath(extensionUri, "resources", "c-dark.png"),
			light: vscode.Uri.joinPath(extensionUri, "resources", "c-light.png"),
		  }
    }
	getLabel() {
		let first = this.node.code.indexOf(this.node.symbol);
		let last = first + this.node.symbol.length;
		return {label: this.node.code, highlights:[]};
	}
	
	getDescription() {
		return `${this.node.fileName} : ${this.node.pos}`;
	}
}

class FileNodeTreeItem extends NodeTreeItem {
    constructor(node) {
        super(node, false);
	this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
	getLabel() {
		return path.parse(this.node.fileName).base;
	}
	
	getDescription() {
		return path.parse(this.node.fileName).dir;
	}
}

class SearchNodeTreeItem extends NodeTreeItem {
    constructor(node) {
        super(node, true);
	this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		this.iconPath = {
			dark: vscode.Uri.joinPath(extensionUri, "resources", "search-dark.png"),
			light: vscode.Uri.joinPath(extensionUri, "resources", "search-light.png"),
		  }
    }
	getLabel() {
		return {label: this.node.symbol, highlights:[[0, this.node.symbol.length]]};
	}
	
	getDescription() {
		return `${this.node.fileName} : ${this.node.pos}`;
	}
}

function parseCallers(symbol, output) {
	let callers;
	let defs = [];
	let decs = [];
	let syms = [];
	// let files = {};

	output.split('\n').forEach(element => {
		let args = element.split(' ')
		if (args.length >= 4) {
			const [fname, func, line, ...rest] = args;
			const code = rest.join(" ");
			// if (!(fname in files)) {
			// 	files[fname] = new FileNode(fname);
			// }
			if (func == "<global>") {
				// files[fname].add(new DeclNode(symbol, fname, line, code));
				decs.push(new DeclNode(symbol, fname, line, code));
			} else if (func == symbol) {
				// files[fname].add(new DefNode(symbol, fname, line, code));
				defs.push(new DefNode(symbol, fname, line, code));
			}else {
				// files[fname].add(new SymbolNode(symbol, func, fname, line, code));
				syms.push(new SymbolNode(symbol, func, fname, line, code));
			}
		} else {
			outCons.appendLine(`Failed parsing: symbol: ${symbol} line:"${element}"`);
		}
	});

	callers = [].concat(decs, defs, syms);
	return callers;
}

async function getCallers(symbol) {
	console.log(`Get refs for "${symbol}"`);
	let CMD = genCscopeCmd(`cscope -d -fcscope.out -L0 ${symbol}`);
	console.log('CMD:', CMD);

	const { stdout, stderr } = await exec(CMD, {cwd: vscode.workspace.workspaceFolders[0].uri.fsPath, timeout: 7000});
	console.log("stdout:", stdout);
	console.log("stderr:", stderr);
	let callers = parseCallers(symbol, stdout);
	console.log('Callers:', callers)
	return callers;
}

function gotoSrc(fname, line) {
	console.log(`Jump To [${fname}:${line}]`);

	if (!fname.includes(vscode.workspace.workspaceFolders[0].uri.fsPath)) {
		fname = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, fname);
	}
	
	vscode.workspace.openTextDocument(fname).then(doc => {
        vscode.window.showTextDocument(doc).then(() => {
            if (vscode.window.activeTextEditor == null) {
                return;
			}
            vscode.window.activeTextEditor.selection = new vscode.Selection(line - 1, 0, line - 1, 0);;
            vscode.window.activeTextEditor.revealRange(vscode.window.activeTextEditor.selection, 
					vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        });
    });
}

class NodeDependenciesProvider {

	constructor() {
		this.paths = [];
		this.refresh = new vscode.EventEmitter();
        	this.onDidChangeTreeData = this.refresh.event;
		this.updateFilter()
    	}

	add(path, fire=true) {
		if (path == null) {
			return;
		}
		this.paths.push(path);
		if (fire) {
			this.refresh.fire();
		}
	}

	set(path) {
		if (path == null) {
			return;
		}
		this.paths = [path];
		this.refresh.fire();
	}
	

	updateFilter() {
		let config = vscode.workspace.getConfiguration('calltree');
		this.includeFilter = config.get('include');
		this.excludeFilter = config.get('exclude');
		this.refresh.fire();
	}

	getTreeItem(element) {
		if (element instanceof FileNode) {
			return new FileNodeTreeItem(element);
		} else if (element instanceof SearchNode) {
			return new SearchNodeTreeItem(element);
		}else if (element instanceof DeclNode) {
			return new DeclNodeTreeItem(element);
		} else if (element instanceof DefNode) {
			return new DefNodeTreeItem(element);
		} else if (element instanceof SymbolNode) {
			return new SymbolNodeTreeItem(element);
		}
    }
  
	getChildren(element) {
		if (element == null){
			return this.paths;
		}
		else {
			let children = element.getChildren();
			console.log(typeof(children));
			
			return children.then((res) => {
				return res.filter(ch => this.includeFilter == '' || ch.fileName.includes(this.includeFilter))
					.filter(ch => this.excludeFilter == '' || !ch.fileName.includes(this.excludeFilter));
			});
		}
		
	}
}

let gTree;
// async function AddNewSearch(symbol) {
// 	let callers = await getCallers(symbol);
// 	callers.forEach(n => gTree.add(n, false));
// 	gTree.refresh.fire();
// }
let extensionUri;
let outCons;
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	outCons = vscode.window.createOutputChannel("calltree");
	extensionUri = context.extensionUri;
	console.log('"calltree" active!');
	outCons.appendLine('"calltree" active!');
	gTree = new NodeDependenciesProvider();
	vscode.window.createTreeView('nodeDependencies', {
		treeDataProvider: gTree
	  });

	context.subscriptions.push(vscode.commands.registerCommand('calltree.build', function () {
		build();
	}));
	outCons.appendLine('"registered" build!');
	context.subscriptions.push(vscode.commands.registerCommand('calltree.find', function () {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		// bring the dependency view to front
		vscode.commands.executeCommand("nodeDependencies.focus");

		vscode.commands.executeCommand('editor.action.addSelectionToNextFindMatch').then(() => {
			let file = activeEditor.document.fileName;
			let line = activeEditor.selection.anchor.line + 1;
			let symbol = activeEditor.document.getText(activeEditor.selection).trim();
			gTree.set(new SearchNode(symbol, vscode.workspace.asRelativePath(file), line));
		});
	
	}));
	context.subscriptions.push(vscode.commands.registerCommand('calltree.gotoSrc', (fname, line) => gotoSrc(fname, line) ));
	context.subscriptions.push(vscode.commands.registerCommand('calltree.settings', function() {
		vscode.commands.executeCommand( 'workbench.action.openSettings', 'calltree' );
	}));

	vscode.workspace.onDidChangeConfiguration(event => {
		let changed = event.affectsConfiguration("calltree");
		if (changed) {
			gTree.updateFilter();
		}
	})
	    
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
