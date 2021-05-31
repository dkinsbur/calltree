const vscode = require('vscode');
const util = require('util');
var path = require('path');

const exec = util.promisify(require('child_process').exec);

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function build() {
	vscode.window.showInformationMessage('Started Building');
  	// const { stdout, stderr } = await exec('ssh dkinsb@dev-dsk-dkinsb-1b-66d7b3dd.eu-west-1.amazon.com "cd /home/dkinsb/code/perftest && cscope -Rb"', {cwd: vscode.workspace.rootPath});
	const { stdout, stderr } = await exec('cscope -Rb', {cwd: vscode.workspace.rootPath});
	vscode.window.showInformationMessage('Done Building');
}
class FuncInfo {
    constructor(funcName, fileName, pos) {
        this.funcName = funcName;
        this.fileName = fileName;
        this.pos = pos;
        this.callee = [];
    }
}

function parseCallers(output) {
	let callers = [];
	output.split('\n').forEach(element => {
		let args = element.split(' ')
		// let caller = element.split(' ', 3);
		if (args.length >= 4) {
			const [fname, func, line, ...rest] = args;
			const code = rest.join(" ");
			callers.push([fname, func, line, code]);
		}
	});
	return callers;
}

async function getCallers(symbol) {
	console.log('symbol',symbol);
	// const { stdout, stderr } = await exec(`ssh  dev-dsk-dkinsb-1b-66d7b3dd.eu-west-1.amazon.com "cd /home/dkinsb/code/perftest && cscope -d -fcscope.out -L3 ${symbol}"`, {cwd: vscode.workspace.rootPath, timeout: 7000});
	const { stdout, stderr } = await exec(`cscope -d -fcscope.out -L0 ${symbol}`, {cwd: vscode.workspace.rootPath, timeout: 7000});
	return parseCallers(stdout);
}

function goto(node) {
	let fname = node.fname;
	const line = node.line;
	if (!fname.includes(vscode.workspace.rootPath)) {
		fname = path.join(vscode.workspace.rootPath, node.fname);
	}
	
	console.log(node);
	
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

class TreeViewItem extends vscode.TreeItem {
    constructor(label, desc, fname, line) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.description = desc;
		this.fname = fname;
		this.line = parseInt(line);
		this.command = {
			command: 'calltree.goto',
			arguments: [this],
			title: 'goto source'
		};
    }
}

class NodeDependenciesProvider {

	constructor() {
		this.paths = [];
		this.refresh = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.refresh.event;
    }

	add(path) {
		console.log('add', path);
		if (path == null) {
			return;
		}
		this.paths.push(path);
		this.refresh.fire();
	}

	getTreeItem(element) {
		console.log('getTreeItem', element);
        return new TreeViewItem(`${element[1]}:  ${element[3]}`, `${element[0]}:${element[2]}`, element[0], element[2]);
    }
  
	getChildren(element) {
		console.log('getChildren', element);
		if (element == null){
			return this.paths;
		}
		else {
			if (element[1] == '<global>') {
				return [];
			} 
			return getCallers(element[1]);
		}
		
	}
}

let gTree;
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Congratulations, your extension "calltree" is now active!');
	gTree = new NodeDependenciesProvider();
	vscode.window.createTreeView('nodeDependencies', {
		treeDataProvider: gTree
	  });

	context.subscriptions.push(vscode.commands.registerCommand('calltree.build', function () {
		build();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('calltree.find', function () {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}
		vscode.commands.executeCommand('editor.action.addSelectionToNextFindMatch').then(() => {
			let file = activeEditor.document.fileName;
			let line = activeEditor.selection.anchor.line;
			let symbol = activeEditor.document.getText(activeEditor.selection);
			console.log();
			gTree.add([file, symbol ,line, '']);
		});
	
	}));
	context.subscriptions.push(vscode.commands.registerCommand('calltree.goto', node => goto(node) ));

}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
