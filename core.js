function $(id) { return document.getElementById(id); }
function setFstHeight(h) {
	if (no_resize_fst) return;
	var exh = 0;
	$("fst").style.height = h;
	$("menu").style.top = $("counter-div").style.top = h+3+exh*5;
	$("control").style.height = h+23+exh*5;
	$("tw").style.top = $("tw2").style.top = $("re").style.top = h+24+exh*4;
}
// 文字参照をデコード
function charRef(s) {
	var ele = document.createElement("div");
	ele.innerHTML = s;
	return ele.firstChild.nodeValue;
}
// クロスドメインJavaScript呼び出し
function loadXDomainScript(url, ele) {
	if (ele && ele.parentNode)
		ele.parentNode.removeChild(ele);
	ele = document.createElement("script");
	ele.src = url;
	ele.type = "text/javascript";
	document.body.appendChild(ele);
	return ele;
}
// クロスドメインJavaScript呼び出し(クラスバージョン)
function XDomainScript() {
	this.cb_cnt = (new Date).getTime();
}
XDomainScript.prototype = {
	load: function(url, callback) {
		var id = this.cb_cnt++;
		var ele = document.createElement("script");
		ele.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=xds.cb' + id;
		ele.type = "text/javascript";
		this['cbe' + id] = ele;
		this['cb' + id] = function(){ this.abort(id); callback.apply(this, arguments); };
		document.body.appendChild(ele);
		return id;
	},
	abort: function(id) {
		var ele = this['cbe' + id];
		if (ele && ele.parentNode) ele.parentNode.removeChild(ele);
		if (this['cb' + id]) delete this['cb' + id];
		if (this['cbe' + id]) delete this['cbe' + id];
	}
};
var xds = new XDomainScript;
// 動的にフレームを生成してPOSTを投げる
var postQueue = [];
function enqueuePost(url, done, err) {
	postQueue.push([url, done, err]);
	if (postQueue.length > 1) // 複数リクエストを同時に投げないようキューイング
		return;
	postNext();
}
function postNext() {
	if (postQueue.length) {
		postInIFrame(postQueue[0][0], postQueue[0][1], postQueue[0][2]);
	}
}
var postSeq = 0;
function postInIFrame(url, done, err) {
	var frm = document.createElement("form");    // POST用のフォームを生成
	frm.action = url;
	frm.method = "POST";
	frm.target = "pfr" + seq;
	document.body.appendChild(frm);
	var pfr = document.createElement("iframe"); // formのtargetとなるiframeを生成
	pfr.name = "pfr" + seq;
	pfr.src = "about:blank";
	pfr.style.display = "none";
	var errTimer = false;
	if (err) {  // 10秒で正常終了しなければエラーとみなす
		errTimer = setTimeout(function(){
			err();
			frm.parentNode.removeChild(frm);
			pfr.parentNode.removeChild(pfr);
			postQueue.shift();
			postNext();
		}, 100000);
	}
	var cnt = 0;
	var onload = pfr.onload = function(){
		if (cnt++ == 0) {
			setTimeout(function(){frm.submit();}, 0);
		} else {
			clearTimeout(errTimer);
			done();
			setTimeout(function(){
				frm.parentNode.removeChild(frm);
				pfr.parentNode.removeChild(pfr);
				postQueue.shift();
				postNext();
			}, 0);
		}
	};
	if ('v'=='\v') pfr.onreadystatechange = function(){ /* for IE */
		if (this.readyState == "complete") {
			pfr.contentWindow.name = pfr.name;
			onload();
		}
	};
	document.body.appendChild(pfr);
}
// 要素の位置を取得
function cumulativeOffset(ele) {
	var top = 0, left = 0;
	do {
		top += ele.offsetTop  || 0;
		left += ele.offsetLeft || 0;
		ele = ele.offsetParent;
	} while (ele);
	return [left, top];
}
// スクロール
if (navigator.userAgent.indexOf('iPhone') >= 0)
	window.scrollBy = function(x,y) { scrollTo(x+window.pageXOffset,y+window.pageYOffset) };
function getScrollY() { return window.pageYOffset || document.body.scrollTop || document.documentElement.scrollTop; }
function scrollToY(y, total, accum, start) {
	var t = (new Date).getTime();
	start = start || t;
	total = total || y - getScrollY();
	accum = accum || 0;
	if (start+500 <= t)
		return scrollBy(0, total-accum);
	var pix = Math.ceil(total*(1-Math.cos((t-start)/500*Math.PI))/2);
	scrollBy(0, pix-accum);
	setTimeout(function(){scrollToY(y, total, pix, start)}, 20);
}
// DOM Storage (or Cookie)
if (!window.localStorage) window.localStorage = window.globalStorage && window.globalStorage[location.hostname];
function readCookie(key) {
	if (window.localStorage && window.localStorage["twicli_"+key])
		return String(window.localStorage["twicli_"+key]);
	key += "=";
	var scookie = document.cookie + ";";
	start = scookie.indexOf(key);
	if (start >= 0) {
		var end = scookie.indexOf(";", start);
		return unescape(scookie.substring(start + key.length, end));
	}
	return null;
}
function writeCookie(key, val, days) {
	if (window.localStorage)
		window.localStorage["twicli_"+key] = val;
	else {
		var sday = new Date();
		sday.setTime(sday.getTime() + (days * 1000 * 60 * 60 * 24));
		document.cookie = key + "=" + escape(val) + ";expires=" + sday.toGMTString();
	}
}
// Array#mapの再実装(Opera用)
if (!Array.prototype.map) {
	Array.prototype.map = function(fun) {
		var len = this.length;
		var res = new Array(len);
		var thisp = arguments[1];
		for (var i = 0; i < len; i++)
			if (i in this)
				res[i] = fun.call(thisp, this[i], i, this);
		return res;
	};
}
// Array#uniqの再実装
Array.prototype.uniq = function() {
	for (var i = 0, l = this.length; i < l; i++)
		for (var j = 0; j < i; j++)
			if (this[i] === this[j])
				this.splice(i--, l-- && 1);
	return this;
};
// user-defined CSS
var user_style = readCookie('user_style') || "";
document.write('<style>' + user_style + '</style>');
