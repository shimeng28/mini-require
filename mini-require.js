/**
 * 该模块加载器包括两个构造函数： Module 和 Task
 * 当定义一个模块时
 * 	usage：define(name, dep, cb)
 * 				define(dep, cb)
 *        define(cb)
 *   例如
 * 			1.define('./a', ['./b'], function(b) {
 * 					console.log('a.js');
 * 					b.say();
 * 	 			});
 *      2.define(['./b'], function(b) {
 * 					console.log('a.js')
 *          b.say();
 *        });
 *      3.define(function(){
 * 					console.log('a.js')
 *					return {
 *						say: function(){
 *              console.log('b.js');
 *            }
 *          };
 * 				});
 * 当require一个对象时，
 * usage: require(['./b'], function(b){
 *					b.say();
 *        })
 *        require(['./b', 'require'], function(b, require) {
 *          require(['./c'], function(c){
 *         	  c.say();
 *          });
 *        });
 *        require(function() {
 *          console.log('main.js');
 *        });
 *  思路：
 *     当定义define一个模块时，数据流为：new Module => init() => defineStatus()(赋予该对象生命周期状态) And parseDep() (遍历依赖)=> status = fetching(下载执行模块文件)
 *       => fetchFinish(成功) OR fetchError(出错)
 *     当导入require一个模块时，数据流: new Task => init() => defineStatus()(赋予该对象生命周期状态) And parseDep() (遍历依赖)=> status = fetching(下载执行模块文件)
 *       => fetchFinish(成功) OR fetchError(出错) => 当status为executeCallBack时说明依赖执行完毕 executeCallBack() 执行回调
 */

let require, define;

(function(global) {
	if (global !== window) {
		console.error('当前环境不是浏览器');
		return;
	}
	// 总的模块 通过key引用模块
	const modules = {};
	// 总的依赖模块 通过依赖模块名作为key，Value为数组，保存的是被依赖的模块
	const depToModule = {};

	// 模块的状态 相当于生命周期
	const moduleStatus = {
		fetching: 1,
		fetchFinish: 2,
		fetchError: 3,
		executeCallBack: 4,
	};
	/**
	 * 加载模块
	 * @param dep 依赖
	 * @param cb 回调
	 */
	require = (dep, cb) => {
		// dep 为函数
		if (isFunction(dep)) {
			cb = dep;
			dep = [];
		}

		if (isArray(dep) && isFunction(cb)) {
			new Task(dep, cb);
		}

	};
  /**
	 * 定义模块
	 * @param name 模块名称
	 * @param dep 模块依赖
	 * @param cb 加载后的回调函数
	 */
	define = (name, dep, cb) => {
		// name 为函数
		if (isFunction(name)) {
			cb = name;
			dep = [];
			name = getCurrentModuleName();
		}
		// name 为数组
		if (isArray(name) && isFunction(dep)) {
			cb = dep;
			dep = name;
			name = getCurrentModuleName();
		}
		// name 为string 缺少dep
		if (isString(name) && isFunction(dep)) {
			cb = dep;
			dep = [];
		}

		if (isString(name) && isArray(dep) && isFunction(cb)) {
			const module = modules[name];
			module.name = name;
			module.dep = dep;
			module.cb = cb;
			module.parseDep();
		};
	};
	/**
	 * Module构造函数
	 * @param {string} name
	 * @param {array} dep
	 * @param {function} cb
	 */
	function Module(name, dep, cb) {
		this.name = name;
		this.dep = dep;
		this.cb = cb;
		this.src = moduleNameToModulePath(name);
		// 将模块引用到module对象里
		modules[name] = this;

		this.init();
	}
	const fn = Module.prototype;
	/**
	 * 初始化module对象
	 */
	fn.init = function() {
		this.defineStatus();
		this.status = 'fetching';
	};
	/**
	 * 状态驱动
	 * @param {string} statusName
	 */
	fn.defineStatus = function(status) {
		Object.defineProperty(this, 'status', {
			get() {
				return status;
			},
			set(newStatus) {
				status = newStatus;
				switch(moduleStatus[status]) {
					// 1.fetching
					case 1:
						this.fetch();
					break;
					// 2.fetchFinish
					case 2:
						this.fetchFinish();
					break;
					// 3.fetchFinish
					case 3:
						this.fetchError();
					break;
					case 4:
						this.executeCallBack();
					break;
				}
			}
		});
	};
	/**
	 * 只有在define和require内部才会用到依赖解析
	 * 解析依赖
	 */
	fn.parseDep = function() {
		const dep = this.dep || [];

		// 依赖中包含有require时
		if (dep.indexOf('require') !== -1) {
			this.requireDepPos = dep.indexOf('require');
			dep.splice(this.requireDepPos, 1);
		}
		let depNum = dep.length;
		// 是否循环引用 循环引用则会报错
		let circularLength = this.circularRefer().length;
		if (circularLength) {
			depNum -= circularLength;
		}
		if (depNum === 0) this.status = 'executeCallBack';

		Object.defineProperty(this, 'depNum', {
			get() {
				return depNum;
			},
			set(newDepNum) {
				depNum = newDepNum;
				if (depNum === 0) {
					this.status = 'executeCallBack'
				}
			}
		});

		// 该模块没有依赖 返回
		if (!depNum) return;

		dep.forEach((depModuleName) => {
			// 如果依赖模块不存在modules中
			if (!modules[depModuleName]) {
				let module = new Module(depModuleName);
				modules[module.name] = module;
			}
			// 如果依赖模块对象depToModule中没有该依赖模块
			if (!depToModule[depModuleName]) {
				depToModule[depModuleName] = [];
			}
			// 将包含依赖模块的模块压入依赖模块所在的索引中
			depToModule[depModuleName].push(this);
		});
	}
	/**
	 * fetch 模块文件 执行模块内部代码
	 */
	fn.fetch = function() {
		const script = document.createElement('script');
		const that = this;
		script.type = 'text/javascript';
		script.src = this.src;
		document.head.appendChild(script);
		script.onload = function() {
			that.status = 'fetchFinish';
		};
		script.onerror = function() {
			that.status = 'fetchError';
		};
	};
	/**
	 * fetch 模块内部代码执行成功之后
	 * 将包含该模块的模块的depNum减一
	 */
	fn.fetchFinish = function() {
		let depedModule = depToModule[this.name];
		if (!depedModule) {
			return;
		};
		depedModule.forEach((module) => {
			module.depNum--;
		});
	};
	/**
	 * fetch 模块失败
	 */
	fn.fetchError = function() {
		console.error(`${this.name}模块加载失败`);
	};
	/**
	 * 依赖模块加载完毕后 即depNum === 0
	 * 执行模块加载后的回调函数
	 */
	fn.executeCallBack = function() {
		// 传入依赖参数
		const arg = (this.dep || []).map((dep) => {
			return modules[dep].exports;
		});
		// 如果含有require依赖的话，将require插入函数参数中
		if (typeof this.requireDepPos === 'number' && this.requireDepPos !== -1) {
			arg.splice(this.requireDepPos, 0, require);
		}

		this.exports = this.cb && this.cb.apply(this, arg);
	};
	/**
	 * 循环引用检查
	 * 返回循环引用的模块的数组集合
	 */
	fn.circularRefer = function() {
		const circularList = [];
		this.dep && this.dep.forEach((dep) => {
			if (depToModule[this.name] && depToModule[this.name].indexOf(modules[dep]) !== -1) {
				circularList.push(dep);
			}
		}, this);

		return circularList;
	};


	/**
	 * @param {array} dep 依赖
	 * @param {function} cb 回调
	 */
	function Task(dep, cb) {
		this.dep = dep;
		this.cb = cb;

		this.init();
	}
	Task.prototype = Object.create(Module.prototype);
	Task.prototype.init = function() {
		this.defineStatus();
		this.parseDep();
	};


	const mainModule = new Module(getEntryModuleName());
	modules[mainModule.name] = mainModule;

	function getEntryModuleName() {
		const mainEntry = document.currentScript.getAttribute('data-main');
		return modulePathToModuleName(mainEntry);
	}
	function getCurrentModulePath() {
		return document.currentScript.getAttribute('src');
	}
	function getCurrentModuleName() {
		const src = getCurrentModulePath();
		return modulePathToModuleName(src);
	}
	function modulePathToModuleName(path) {
		const reg = /\w+.js/;
		if (reg.test(path)) {
			let pos = path.lastIndexOf('.');
			return path.slice(0, pos);
		}
	}
	/**
	 * 将模块名称装换为路径
	 * 如 ./a.js
	 *
	 * @param {string} name
	 */
	function moduleNameToModulePath(name) {
		const reg = /\w*.js/;
		if (reg.test(name)) {
			return name;
		}
		return `${name}.js`;
	}


	function getType(arg) {
		return Object.prototype.toString.call(arg).slice(8, -1);
	}
	function isFunction(arg) {
		if (getType(arg) === 'Function') {
			return true;
		}
		return false;
	}
	function isArray(arg) {
		if (getType(arg) === 'Array') {
			return true;
		}
		return false;
	}
	function isString(arg) {
		if (getType(arg) === 'String') {
			return true;
		}
		return false;
	}
})(this);