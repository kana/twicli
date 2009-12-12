var twitterURL = 'http://twitter.com/';
var twitterAPI = 'http://api.twitter.com/1/';
var myname = null;		// 自ユーザ名
var myid = null;		// 自ユーザID
var last_user = null;	// user TLに表示するユーザ名
// 設定値
var cookieVer = parseInt(readCookie('ver')) || 0;
var updateInterval = (cookieVer>3) && parseInt(readCookie('update_interval')) || 60;
var pluginstr = (cookieVer>6) && readCookie('tw_plugins') || ' regexp.js\nlists.js\noutputz.js\nsearch.js\nsearch2.js\nfavotter.js\nfollowers.js\nshorten_url.js\nresolve_url.js';
if (!(cookieVer>7)) pluginstr+="\ntranslate.js";
pluginstr = pluginstr.substr(1);
var plugins = new Array;
var max_count = Math.min((cookieVer>3) && parseInt(readCookie('max_count')) || 50, 200);
var max_count_u = Math.min(parseInt(readCookie('max_count_u')) || 50, 200);;
var nr_limit = Math.max(max_count*2.5, parseInt(readCookie('limit')) || 500);		// 表示する発言数の上限
var no_since_id = parseInt(readCookie('no_since_id') || "0");		// since_idを使用しない
var no_counter = parseInt(readCookie('no_counter') || "0");			// 発言文字数カウンタを無効化
var no_resize_fst = parseInt(readCookie('no_resize_fst') || "0");	// フィールドの自動リサイズを無効化
var replies_in_tl = parseInt(readCookie('replies_in_tl') || "1");	// フォロー外からのReplyをTLに表示
var footer = readCookie('footer') || ""; 							// フッタ文字列
var decr_enter = parseInt(readCookie('decr_enter') || "0");			// Shift/Ctrl+Enterで投稿
// TL管理用
var nr_tw = 0;					// 現在のTLの発言数
var cur_page = 1;				// 現在表示中のページ
var nr_page = 0;				// 次に取得するページ
var nr_page_re = 0;				// 次に取得するページ(reply用)
var get_next_func = getOldTL;	// 次ページ取得関数
var since_id = null;			// TLの最終since_id
var since_id_reply = null;		// Replyの最終since_id
var in_reply_to_user = null;	// 発言の返信先
var tl_oldest_id = null;		// TLの最も古いid
// クロスドメイン通信関連
var seq = (new Date).getTime();
var users_log = [];
var users_xds = [];
var auth_ele = null;
var update_ele = null;
var update_ele2 = null;
var reply_ele = null;
var reply_ele2 = null;
var direct_ele1 = null;
var direct_ele2 = null;
var direct1 = null;
var direct2 = null;
// UI関連
var user_pick1 = null;			// [⇔]で表示するユーザ名1
var user_pick2 = null;			// [⇔]で表示するユーザ名2
var popup_user = null;			// ポップアップメニューが選択されたユーザ名
var popup_id = null;			// ポップアップメニューが選択された発言ID
var popup_ele = null;			// ポップアップメニューが選択された発言ノード
var fav_mode = 0;				// fav表示中か
var rep_top = 0;				// replyのオーバーレイ位置
var popup_top = 0;				// ポップアップメニューの表示位置
var selected_menu = $("TL");	// 選択中のタブ
var update_timer = null;
var update_reply_counter = 0;
var update_direct_counter = 0;
var key_press_detected = false;
var last_post = null;
var last_in_reply_to_user = null;
var last_direct_id = null;

//ログイン・自ユーザ名受信
function twAuth(a) {
	if (a.error) return alert(a.error);
	myname = last_user = a.screen_name;
	myid = a.id;
	$("user").innerHTML = last_user;
	update();
}
function auth() {
	auth_ele = loadXDomainScript(twitterAPI + "account/verify_credentials.json?callback=twAuth&seq="+(seq++), auth_ele);
}

// enterキーで発言, "r"入力で再投稿, 空欄でTL更新
function press(e) {
	if (e != 1) key_press_detected = true;
	if (e != 1 && (e.keyCode != 13 && e.keyCode != 10 ||
		!decr_enter && (e.ctrlKey || e.shiftKey) || decr_enter && !(e.ctrlKey || e.shiftKey)) )
			return true;
	if (!key_press_detected) document.frm.status.value = document.frm.status.value.replace(/\n/g, "");
	if (document.frm.status.value == '') {
		$("loading").style.display = "block";
		update();
		return false;
	}
	if (document.frm.status.value.length > 140) {
		alert("This tweet is too long.");
		return false;
	}
	if (document.frm.status.value == "r" && last_post) {
		document.frm.status.value = last_post;
		in_reply_to_user = last_in_reply_to_user;
	}
	last_post = document.frm.status.value;
	last_in_reply_to_user = in_reply_to_user;
	if (document.frm.status.value.indexOf("@"+in_reply_to_user) < 0) // @ユーザが含まれているときのみ返信先を指定
		setReplyId(false);
	in_reply_to_user = "";
	callPlugins("post", document.frm.status.value);
	document.frm.status.value += footer;
	document.frm.status.select();
	document.frm.submit();
	return false;
}
// 発言文字数カウンタ表示・更新
function updateCount() {
	setFstHeight($("fst").value.length ? Math.max($("fst").scrollHeight+2,30) : 30);
	if (no_counter) return;
	$("counter-div").style.display = "block";
	$("counter").innerHTML = 140 - footer.length - $("fst").value.length;
}
// フォームの初期化
resetFrm = function() {
	document.frm.reset();
	setReplyId(false);
	if ($("counter-div").style.display == "block") updateCount();
	setFstHeight(30);
}
// reply先の設定/解除
function setReplyId(id) {
	var repid = $('in_reply_to_status_id');
	if (repid && repid.parentNode)
		repid.parentNode.removeChild(repid);
	if (id) {
		repid = document.createElement('input');
		repid.type = 'hidden';
		repid.id = repid.name = 'in_reply_to_status_id';
		repid.value = id;
		document.frm.appendChild(repid);
	}
}
// reply先を設定
function replyTo(user, id) {
	in_reply_to_user = user;
	document.frm.status.value = (selected_menu.id == "direct" ? "d " : "@") + user + " " + document.frm.status.value;
	setReplyId(id);
	document.frm.status.select();
}
// reply先を表示
function dispReply(user, id, ele) {
	user_pick1 = user;
	var d = $((selected_menu.id == "TL" ? "tw" : "tw2c") + "-" + id);
	if (!d || d.style.display == "none") {
		rep_top = cumulativeOffset(ele)[1] + 20;
		d = selected_menu.id != "TL" && $("tw" + "-" + id);
		if (d) {
			$('reps').innerHTML = d.innerHTML;
			$('rep').style.display = "block";
			$('rep').style.top = rep_top;
			user_pick2 = d.screen_name;
			return;
		}
		$("loading").style.display = "block";
		reply_ele = loadXDomainScript(twitterAPI + 'statuses/show/'+id+'.json?callback=dispReply2', reply_ele);
		return;
	}
	closeRep();
	var top = cumulativeOffset(d)[1];
	var h = d.offsetHeight;
	var sc_top = document.body.scrollTop || document.documentElement.scrollTop;
	var win_h = window.innerHeight || document.documentElement.clientHeight;
	if (top < sc_top) scrollToY(top);
	if (sc_top+win_h < top+h) scrollToY(top+h-win_h);
	d.className += ' emp';
	setTimeout(function(){d.className = d.className.replace(' emp','')}, 2000);
}
// reply先をoverlay表示 (Timelineに無い場合)
function dispReply2(tw) {
	$("loading").style.display = "none";
	if (tw.error) return alert(tw.error);
	$('reps').innerHTML = makeHTML(tw);
	callPlugins("newMessageElement", $('reps'), tw);
	$('rep').style.display = "block";
	$('rep').style.top = rep_top;
	user_pick2 = tw.user.screen_name;
}
// replyのoverlay表示を閉じる
function closeRep() {
	$('rep').style.display = 'none';
}
// replyからユーザ間のタイムラインを取得
function pickup2() {
	if (user_pick1 && user_pick2)
		switchUser(user_pick1 + "," + user_pick2);
}
// ポップアップメニューを表示
function popup_menu(user, id, ele) {
	popup_user = user;
	popup_id = id;
	popup_ele = ele.parentNode.parentNode;
	callPlugins("popup", $('popup'), user, id, ele);
	$('popup_link_user').href = twitterURL + user;
	$('popup_link_status').href = twitterURL + user + '/statuses/' + id;
	$('popup_status_delete').style.display = (user == myname ? "block" : "none");
	$('popup_status_retweet').style.display = (selected_menu.id != "direct" ? "block" : "none");
	$('popup_status_quote').style.display = (selected_menu.id != "direct" ? "block" : "none");
	$('popup').style.display = "block";
	var pos = cumulativeOffset(ele);
	$('popup').style.left = pos[0] <  $('popup').offsetWidth - ele.offsetWidth ? 0 : pos[0] - $('popup').offsetWidth + ele.offsetWidth;
	$('popup').style.top = popup_top = pos[1] + 20;
	$('popup_hide').style.height = Math.max(document.body.scrollHeight, $("tw").offsetHeight+$("control").offsetHeight);
	$('popup_hide').style.display = "block";
}
// ポップアップメニューを非表示
function popup_hide() {
	$('popup').style.display = 'none';
	$('popup_hide').style.display = 'none';
	popup_user = popup_id = popup_ele = null;
}
// 発言のReTweet
function retweetStatus() {
	if (!popup_id) return false;
	if ($('lock-' + popup_id)) {
		alert("This tweet is protected.");
		return false;
	}
	if (!confirm("Retweet to your followers?")) return false;
	$("loading").style.display = "block";
	var target_ele = popup_ele;
	enqueuePost(twitterAPI + 'statuses/retweet/' + popup_id + '.xml?source=twicli',
		function(){
			$("loading").style.display = "none";
			var img = document.createElement("img");
			img.src = "rt.png";
			target_ele.insertBefore(img, target_ele.childNodes[target_ele.childNodes.length-1]);
		});
	return false;
}
// 発言をRT付きで引用
function quoteStatus() {
	if (!popup_id) return false;
	if ($('lock-' + popup_id) && !confirm("This tweet is protected; Are you sure to retweet?")) return false;
	$('fst').value = "RT @"+popup_user+": " + charRef(popup_ele.tw.text);
	$('fst').focus(); $('fst').select();
	return false;
}
// 発言の削除
function deleteStatus() {
	if (!popup_id) return false;
	if (!confirm("Are you sure to delete this tweet (@"+popup_user+" / "+popup_id+")?")) return false;
	$("loading").style.display = "block";
	if ($("text" + popup_id)) $("text" + popup_id).style.textDecoration = "line-through";
	enqueuePost(twitterAPI + 'statuses/destroy/' + popup_id + '.xml',
		function(){$("loading").style.display = "none";}, function(){$("loading").style.display = "none";});
	return false;
}
// 最新タイムラインを取得
update_inited = function() {
	if (!myname) return auth();
	callPlugins("update");
	update_ele = loadXDomainScript(twitterAPI + 'statuses/home_timeline.json?seq=' + (seq++) +
						'&count=' + (since_id ? 200 : max_count) +
						'&callback=twShow' + (!no_since_id && since_id ? '&since_id='+since_id : ''), update_ele);
	resetUpdateTimer();
}
function resetUpdateTimer() {
	if (update_timer) clearInterval(update_timer);
	update_timer = setInterval(update, updateInterval*1000);
}
// twitのHTML表現を生成
function dateFmt(d) {
	d = new Date(typeof(d)=='string' ? d.replace('+','GMT+') : d);
	function d2(dig) { return (dig>9?"":"0") + dig }
	return (d.getMonth()+1) + "/" + d.getDate() + " " + d.getHours() + ":" + d2(d.getMinutes()) + ":" + d2(d.getSeconds());
}
function insertPDF(str) {
	var k = 0;
	for (var i = 0; i < str.length; i++) {
		if (str[i] == "\u202A" || str[i] == "\u202B" || str[i] == "\u202D" || str[i] == "\u202E")
			k++;
		else if (str[i] == "\u202C" && i > 0)
			k--;
	}
	while (k--)
		str += "\u202C"
	return str;
}
function makeHTML(tw, no_name, pid) {
	var un = tw.user.screen_name;
	return /*fav*/ '<img alt="☆" class="fav" src="http://assets3.twitter.com/images/icon_star_'+(tw.favorited?'full':'empty')+'.gif" ' +
			'onClick="fav(this,' + tw.id + ')"' + (pid ? ' id="fav-'+pid+'-'+tw.id+'"' : '') + '>' +
		 (!no_name ?
			//ユーザアイコン
			(tw.user.url ? '<a target="twitter" href="'+tw.user.url+'">' : '') +
			'<img class="uicon" src="' + tw.user.profile_image_url + '">' + (tw.user.url ? '</a>' : '') +
			//名前
			'<a href="' + twitterURL + un + '" onClick="switchUser(\'' + un + '\');return false"><span class="uid">' + un + '</span>' +
			 /*プロフィールの名前*/ (tw.user.name!=un ? '<span class="uname">('+insertPDF(tw.user.name)+')</span>' : '') + '</a>'
		: '') +
		 /* protected? */ (tw.user.protected ? '<img alt="lock" id="lock-' + tw.id + '" class="lock" src="http://assets0.twitter.com/images/icon_lock.gif">' : '') +
		/*ダイレクトメッセージの方向*/ (tw.d_dir == 1 ? '<span class="dir">→</span> ' : tw.d_dir == 2 ? '<span class="dir">←</span> ' : '') +
		//本文 (https〜をリンクに置換 + @を本家リンク+JavaScriptに置換)
		" <span id=\"text" + tw.id + "\" class=\"status\">" +
		tw.text.replace(/https?:\/\/[\w!#$%&'()*+,.\/:;=?@~-]+(?=&\w+;)|https?:\/\/[\w!#$%&'()*+,.\/:;=?@~-]+|@([\/\w-]+)/g, function(_,id){
				if (!id) return "<a class=\"link\" target=\"twitter\" href=\""+_+"\">"+_+"</a>";
				if (id.indexOf('/') > 0) return "<a target=\"twitter\" href=\""+twitterURL+id+"\">"+_+"</a>";
				return "<a href=\""+twitterURL+id+"\" onClick=\"switchUser('"+id+"'); return false;\" >"+_+"</a>";
			}).replace(/\r?\n|\r/g, "<br>") + '</span>' +
		//日付
		' <span class="utils"><span class="prop"><a class="date" target="twitter" href="'+twitterURL+un+'/statuses/'+tw.id+'">' + dateFmt(tw.created_at) + '</a>' +
		//クライアント
		(tw.source ? '<span class="separator"> / </span><span class="source">' + tw.source.replace(/<a /,'<a target="twitter"') + '</span>' : '') + '</span>' +
		//返信先を設定
		' <a class="button" href="javascript:replyTo(\'' + un + "'," + tw.id + ')"><img src="reply.png" alt="↩" width="14" height="14"></a>' +
		//返信元へのリンク
		(tw.in_reply_to_status_id ? ' <a class="button" href="#" onClick="dispReply(\'' + un + '\',' + tw.in_reply_to_status_id + ',this); return false;"><img src="inrep.png" alt="☞" width="14" height="14"></a>' : '') +
		//popupメニュー表示
		'&nbsp;&nbsp;&nbsp;<a class="button popup" href="#" onClick="popup_menu(\'' + un + "'," + tw.id + ', this); return false;"><small><small>▼</small></small></a>' +
		'</span><div class="dummy"></div>';
}
// ユーザ情報のHTML表現を生成
function makeUserInfoHTML(user) {
	return '<table><tr><td><a target="twitter" href="' + twitterURL + 'account/profile_image/'+
			user.screen_name+'"><img class="uicon2" src="' + user.profile_image_url + '"></a></td><td id="profile">' +
			(user.protected ? '<img alt="lock" src="http://assets0.twitter.com/images/icon_lock.gif">' : '') +
			'<b>' + user.screen_name + '</b> / <b>' + user.name + '</b><br>' +
			(user.location ? '<b>Location</b>: ' + user.location + '<br>' : '') +
			(user.url ? '<b>URL</b>: <a target="twitter" href="' + user.url + '">' + user.url + '</a><br>' : '') +
			(user.description ? user.description : '') +
			'<br><b>' + user.friends_count + '<small>following</small> / ' + 
						user.followers_count + '<small>followers</small>' +
			'<br>' + user.statuses_count + '<small>updates</small> / ' +
						user.favourites_count + '<small>favs</small></b>' +
			'</td></tr></table><a target="twitter" href="' + twitterURL + user.screen_name + '">[Twitter]</a> '+
			'<a href="javascript:switchFav()">[Fav]</a> ';
}
// 過去の発言取得ボタン(DOM)生成
function nextButton(id, p) {
	var ret = document.createElement('div');
	ret.id = id;
	ret.className = 'get-next';
	ret.onclick = function() { getNext(this); };
	ret.innerHTML = '▽' + (p ? '(' + p + ')' : '');
	return ret;
}
// favoriteの追加/削除
function fav(img, id) {
	if (img.src.indexOf('throbber') >= 0) return;
	var f = img.src.indexOf('empty') >= 0;
	setFavIcon(img, id, -1);
	enqueuePost(twitterAPI + 'favorites/' + (f ? 'create' : 'destroy') + '/' + id + '.xml',
		function(){ setFavIcon(img, id, f) }, function(){ setFavIcon(img, id, !f) });
}
// favアイコンの設定(f=0: 未fav, f=1:fav済, f=-1:通信中)
function setFavIcon(img, id, f) {
	var img_tl = $('fav-tw-' + id);
	var img_url = (f==-1) ? twitterURL + 'images/icon_throbber.gif' :
						'http://assets3.twitter.com/images/icon_star_' + (f ? 'full' : 'empty') + '.gif';
	img.src = img_url;
	if (img_tl) img_tl.src = img_url;
	callPlugins("fav", id, f, img, img_tl);
}
// followとremove
function follow(f) {
	enqueuePost(twitterAPI + 'friendships/' + (f ? 'create' : 'destroy') + '/' + last_user + '.xml', switchUser);
	$("loading").style.display = "block";
}
// ユーザ情報を表示
function twUserInfo(user) {
	if (user.error) return alert(user.error);
	var elem = $('user_info');
	elem.innerHTML = makeUserInfoHTML(user);
	callPlugins("newUserInfoElement", elem, user);
	if (myname != user.screen_name) {
		update_ele2 = loadXDomainScript(twitterAPI + 'friendships/show.json?seq=' + (seq++) +
					'&source_screen_name=' + myname + '&target_id=' + user.id +
					'&callback=twRelation', update_ele2);
	}
}
// ユーザ情報にフォロー関係を表示
function twRelation(rel) {
	var source = rel.relationship.source;
	var elem = $("user_info");
	elem.innerHTML += '<input type="button" value="' + (source.following ? 'Remove ' : 'Follow ') +  last_user +
					'" onClick="follow('+!source.following+')">';
	if (source.followed_by)
		$("profile").innerHTML += "<br><b>" + rel.relationship.target.screen_name + ' is following you!</b>';
	callPlugins("newUserRelationship", elem, rel);
}
// ダイレクトメッセージ一覧の受信
function twDirect1(tw) {
	if (tw.error) return alert(tw.error);
	direct1 = tw;
	if (direct2)
		twDirectShow();
}
function twDirect2(tw) {
	if (tw.error) return alert(tw.error);
	direct2 = tw;
	if (direct1)
		twDirectShow();
}
function twDirectShow() {
	var direct = direct1.concat(direct2).sort(function(a,b){return b.id - a.id});
	direct = direct.map(function(d){
		if (d.recipient_screen_name == myname) {
			d.user = d.sender;
			d.d_dir = 1;
		} else {
			d.user = d.recipient;
			d.d_dir = 2;
		}
		return d;
	});
	twShow2(direct);
	direct1 = direct2 = false;
}
function checkDirect() {
	direct_ele1 = loadXDomainScript(twitterAPI + 'direct_messages.json?seq=' + (seq++) +
									'&callback=twDirectCheck', direct_ele1);
	update_direct_counter = 20;
}
function twDirectCheck(tw) {
	if (!tw || tw.length == 0) return false;
	if (last_direct_id && last_direct_id < tw[0].id)
			$("direct").className += " new";
	last_direct_id = tw[0].id;
}
// API制限情報の受信
function twLimit(lim) {
	$("loading").style.display = "none";
	$("tw2c").innerHTML = "<b>Twitter API status:</b><br>" +
					"hourly limit : " + lim.remaining_hits + " / " + lim.hourly_limit + "<br>" +
					"reset at : " + dateFmt(lim.reset_time);
}
// 新着reply受信通知
function noticeNewReply(replies) {
	if ($("reply").className.indexOf("new") < 0)
		$("reply").className += " new";
	callPlugins("noticeNewReply", replies);
}
// 新着repliesを取得
function getReplies() {
		reply_ele2 = loadXDomainScript(twitterAPI + 'statuses/mentions.json?seq=' + (seq++) +
						'&count=' + (since_id_reply ? 200 : max_count_u) +
						(since_id_reply ? '&since_id='+since_id_reply : '') +
						'&callback=twReplies',
					reply_ele2);
		update_reply_counter = 4;
}
// 受信repliesを表示
function twReplies(tw, fromTL) {
	if (tw.error) return alert(tw.error);
	tw.reverse();
	for (var j in tw) callPlugins("gotNewReply", tw[j]);
	tw.reverse();
	if (nr_page_re == 0) {
		nr_page_re = 2;
		$("re").appendChild(nextButton('get_old_re', nr_page_re));
	}
	twShowToNode(tw, $("re"), false, false, true, false, false, false, fromTL);
	if (!fromTL && replies_in_tl)
		twShowToNode(tw, $("tw"), false, false, true, false, true);
	if (!fromTL && tw.length > 0) since_id_reply = tw[0].id;
}
// 受信twitを表示
function twShow(tw) {
	if (tw.error) return alert(tw.error);
	tw.reverse();
	for (var j in tw) callPlugins("gotNewMessage", tw[j]);
	if(!tl_oldest_id && tw.length > 0) tl_oldest_id = tw[0].id;
	tw.reverse();
	if (nr_page == 0) {
		nr_page = max_count == 200 ? 2 : 1;
		$("tw").appendChild(nextButton('get_old', nr_page));
	}

	// double check since_id
	if (!no_since_id && since_id)
		for (var i = 0; i < tw.length; i++)
			if (tw[i].id <= since_id)
				tw.splice(i--, 1);

	twShowToNode(tw, $("tw"), false, false, true, true, true);
	if (tl_oldest_id && update_reply_counter-- <= 0)
		getReplies();
	if (tl_oldest_id && update_direct_counter-- <= 0)
		checkDirect();
	callPlugins("noticeUpdate", tw);
}
function twOld(tw) {
	if (tw.error) return alert(tw.error);
	var tmp = $("tmp");
	twShowToNode(tw, $("tw"), false, true, false, false, false, true);
	if (tmp && tmp.parentNode) tmp.parentNode.removeChild(tmp);
	$("tw").appendChild(nextButton('get_old', nr_page));
}
function twOldReply(tw) {
	if (tw.error) return alert(tw.error);
	var tmp = $("tmp");
	twShowToNode(tw, $("re"), false, true, false, false, false, true);
	if (tmp && tmp.parentNode) tmp.parentNode.removeChild(tmp);
	$("re").appendChild(nextButton('get_old_re', nr_page_re));
}
function twShow2(tw) {
	if (tw.error) return alert(tw.error);
	var tmp = $("tmp");
	if (tmp && tmp.parentNode) tmp.parentNode.removeChild(tmp);
	var user_info = $("user_info");
	twShowToNode(tw, $("tw2c"), !!user_info && !fav_mode, cur_page > 1);
	if (selected_menu.id == "reply" || selected_menu.id == "user" && last_user.indexOf(',') < 0) {
		$("tw2c").appendChild(nextButton('next'));
		get_next_func = getNextFuncCommon;
	}
	if (tw[0] && selected_menu.id == "user" && last_user.indexOf(',') < 0 && !fav_mode)
		twUserInfo(tw[0].user);
}
function twShow3(tw) {
	if (tw.error) return alert(tw.error);
	users_log.push(tw);
	if (users_log.length == last_user.split(',').length) {
		var tws = [];
		for (var i = 0; i < users_log.length; i++)
			tws = tws.concat(users_log[i]);
		tws = tws.sort(function(a,b){return b.id - a.id});
		twShow2(tws);
	}
}
function twShowToNode(tw, twNode, no_name, after, animation, check_since, ignore_old, ignore_new, weak) {
	$('loading').style.display = 'none';
	var len = tw.length;
	if (len == 0) return 0;
	var pNode = document.createElement('div');
	var dummy = pNode.appendChild(document.createElement('div'));
	var myname_r = new RegExp("@"+myname+"\\b","i");
	var nr_show = 0;
	var replies = [];
	for (var i = len-1; i >= 0; i--) {
		var duplication = $(twNode.id + "-" + tw[i].id);
		if (duplication) {
			if (duplication.weak)
				duplication.parentNode.removeChild(duplication);
			else
				continue;
		}
		if (ignore_old && tl_oldest_id > tw[i].id)
			continue;
		if (ignore_new && tl_oldest_id < tw[i].id)
			continue;
		if (tw[i].user) {
			var s = document.createElement('div');
			s.id = twNode.id + "-" + tw[i].id;
			s.innerHTML = makeHTML(tw[i], no_name, twNode.id);
			s.screen_name = tw[i].user.screen_name;
			s.tw = tw[i]; // DOMツリーにJSONを記録
			if (weak) s.weak = true;
			if (tw[i].d_dir == 1 || tw[i].text.match(myname_r)) {
				s.className = "tome";
				if (animation && !duplication) {
					replies.push(tw[i]);
				}
			}
			if (tw[i].d_dir == 2 || tw[i].user.screen_name == myname)
				s.className = "fromme";
			if (tw[i].retweeted_status)
				s.className += " retweeted";
			callPlugins("newMessageElement", s, tw[i], twNode.id);
			pNode.insertBefore(s, pNode.childNodes[0]);
			nr_show++;
		}
	}
	pNode.removeChild(dummy);
	if (pNode.childNodes.length == 0) return 0;
	pNode.style.overflow = "hidden";
	var animation2 = animation && getScrollY() < 10;
	var maxH;
	if (animation2) { // get maxH
		twNode.appendChild(pNode);
		maxH = pNode.clientHeight;
		twNode.removeChild(pNode);
		pNode.style.minHeight = 0;
	}
	if (after || !twNode.childNodes[0])
		twNode.appendChild(pNode);
	else
		twNode.insertBefore(pNode, twNode.childNodes[0]);
	if (animation2)
		animate(pNode, maxH, (new Date).getTime());
	else if (animation) {
		$('rep').style.top = (rep_top += pNode.clientHeight+1);
		$('popup').style.top = (popup_top += pNode.clientHeight+1);
		scrollBy(0, pNode.clientHeight+1);
	}
	if (twNode.id == 'tw') {
		nr_tw += nr_show;
		if (nr_tw > nr_limit) {
			while (nr_tw > nr_limit) {
				var last_node = twNode.childNodes[twNode.childNodes.length-1];
				nr_tw -= last_node.childNodes.length;
				twNode.removeChild(last_node);
			}
			tl_oldest_id = 0; // 最大3ブロックスキャンしてoldest更新(repliesの挿入等により必ずしもID順でない)
			for (var i = 0; i < 3 && i < twNode.childNodes.length; i++) {
				var target_block = twNode.childNodes[twNode.childNodes.length-i-1].childNodes;
				var target_ele = target_block[target_block.length-1];
				if (target_ele.tw && (target_ele.tw.id < tl_oldest_id || !tl_oldest_id))
					tl_oldest_id = target_ele.tw.id;
			}
		}
	}
	for (var i = 0; check_since && i < len; i++) {
		if (tw[i].user.screen_name != myname) {
			since_id = tw[i].id;
			break;
		}
	}
	if (replies.length) {
		if (twNode.id == "tw")
			twReplies(replies, true);
		else if (weak || since_id_reply) // 初回Reply取得時にはnoticeしない
			noticeNewReply(replies);
	}
	return nr_show;
}
// 新規twitの出現アニメーション処理
function animate(elem, max, start) {
	var t = (new Date).getTime();
	if (start+1000 <= t)
		return elem.style.maxHeight = 'none';
	elem.style.maxHeight = Math.ceil(max*(1-Math.cos((t-start)/1000*Math.PI))/2);
	setTimeout(function(){animate(elem, max, start)}, 20);
}
// 次ページ取得
function getNext(ele) {
	var tmp = document.createElement("div");
	tmp.id = "tmp";
	tmp.innerHTML = "<p></p>";
	ele.parentNode.appendChild(tmp);
	ele.parentNode.removeChild(ele);
	$("loading").style.display = "block";
	get_next_func();
}
function getOldTL() {
	update_ele2 = loadXDomainScript(twitterAPI + 'statuses/home_timeline.json?seq=' + (seq++) +
				'&count=200&page=' + (nr_page++) +
				'&callback=twOld', update_ele2);
}
function getOldReply() {
	update_ele2 = loadXDomainScript(twitterAPI + 'statuses/mentions.json?seq=' + (seq++) +
				'&count=' + max_count_u + '&page=' + (nr_page_re++) +
				'&callback=twOldReply', update_ele2);
}
function getNextFuncCommon() {
	if (selected_menu.id == "user" && !fav_mode)
		update_ele2 = loadXDomainScript(twitterAPI + 'statuses/user_timeline.json?seq=' + (seq++) +
					'&count=' + max_count_u + '&page=' + (++cur_page) + '&screen_name=' + last_user +
					'&suppress_response_codes=true&callback=twShow2', update_ele2);
	else if (selected_menu.id == "user" && fav_mode)
		update_ele2 = loadXDomainScript(twitterAPI + 'favorites/' + last_user + '.json?seq=' + (seq++) +
					'&page=' + (++cur_page) + '&callback=twShow2', update_ele2);
}
// タイムライン切り替え
function switchTo(id) {
	selected_menu.className = "";
	selected_menu = $(id);
	selected_menu.className = "sel";
	$("tw").style.display = id=="TL"?"block":"none";
	$("re").style.display = id=="reply"?"block":"none";
	$("tw2h").innerHTML = "";
	$("tw2c").innerHTML = "";
	$("tw2").style.display = id!="TL"&&id!="reply"?"block":"none";
	$("rep").style.display = "none";
	scrollTo(0, 1); scrollTo(0, 0);
	cur_page = 1;
	fav_mode = 0;
}
function switchTL() {
	get_next_func = getOldTL;
	switchTo("TL");
}
function switchReply() {
	get_next_func = getOldReply;
	if (selected_menu.id == "reply") {
		switchTo("reply");
		$("loading").style.display = "block";
		getReplies();
	} else {
		switchTo("reply");
	}
}
function switchUser(user) {
	if (!user) user = last_user;
	last_user = user;
	$("user").innerHTML = user;
	switchTo("user");
	$("loading").style.display = "block";
	var users = user.split(',');
	if (users.length == 1) {
		$("tw2h").innerHTML = "<div id=\"user_info\"></div>";
		update_ele2 = loadXDomainScript(twitterAPI + 'statuses/user_timeline.json?seq=' + (seq++) +
			'&count=' + max_count_u + '&screen_name=' + user + '&callback=twShow2', update_ele2);
	} else {
		users_log = [];
		for (var i = 0; i < users_xds.length; i++)
			xds.abort(users_xds[i]);
		users_xds = users.map(function(u) {
			xds.load(twitterAPI + 'statuses/user_timeline.json?screen_name=' + u +
							 '&suppress_response_codes=true&count=' + max_count_u, twShow3);
		});
	}
}
function switchFav() {
	$("loading").style.display = "block";
	cur_page = 1;
	fav_mode = 1;
	$("tw2c").innerHTML = "";
	update_ele2 = loadXDomainScript(twitterAPI + 'favorites/' + last_user + '.json?seq=' + (seq++) +
										'&callback=twShow2', update_ele2);
}
function switchDirect() {
	switchTo("direct");
	$("loading").style.display = "block";
	direct_ele1 = loadXDomainScript(twitterAPI + 'direct_messages.json?seq=' + (seq++) +
										'&callback=twDirect1', direct_ele1);
	direct_ele2 = loadXDomainScript(twitterAPI + 'direct_messages/sent.json?seq=' + (seq++) +
										'&callback=twDirect2', direct_ele2);
}
function switchMisc() {
	switchTo("misc");
	$("tw2h").innerHTML = '<br><a target="twitter" href="index.html"><b>twicli</b></a> : A browser-based Twitter client<br><small>Copyright &copy; 2008-2009 NeoCat</small><hr class="spacer">' +
					'<form onSubmit="switchUser($(\'user_id\').value); return false;">'+
					'show user info : @<input type="text" size="15" id="user_id" value="' + myname + '"><input type="image" src="go.png"></form><hr class="spacer">' +
					'<div id="pref"><a href="javascript:togglePreps()">▼<b>Preferences</b></a>' +
					'<form id="preps" onSubmit="setPreps(this); return false;" style="display: none;">' +
					'max #msgs in TL: <input name="limit" size="5" value="' + nr_limit + '"><br>' +
					'#msgs in TL on update (max=200): <input name="maxc" size="3" value="' + max_count + '"><br>' +
					'#msgs in user on update (max=200): <input name="maxu" size="3" value="' + max_count_u + '"><br>' +
					'update interval: <input name="interval" size="3" value="' + updateInterval + '"> sec<br>' +
					'<input type="checkbox" name="since_check"' + (no_since_id?"":" checked") + '>since_id check<br>' +
					'<input type="checkbox" name="replies_in_tl"' + (replies_in_tl?" checked":"") + '>show not-following replies in TL<br>' +
					'<input type="checkbox" name="counter"' + (no_counter?"":" checked") + '>POST length counter<br>' +
					'<input type="checkbox" name="resize_fst"' + (no_resize_fst?"":" checked") + '>Auto-resize field<br>' +
					'<input type="checkbox" name="decr_enter"' + (decr_enter?" checked":"") + '>Post with ctrl/shift+enter<br>' +
					'Footer: <input name="footer" size="10" value="' + footer + '"><br>' +
					'Plugins:<br><textarea cols="30" rows="4" name="list">' + pluginstr + '</textarea><br>' +
					'user stylesheet:<br><textarea cols="30" rows="4" name="user_style">' + user_style + '</textarea><br>' +
					'<input type="submit" value="Save"></form></div><hr class="spacer">';
	callPlugins("miscTab", $("tw2h"));
	$("loading").style.display = "block";
	update_ele2 = loadXDomainScript(twitterAPI + 'account/rate_limit_status.json?seq=' + (seq++) +
										'&id=' + myname + '&callback=twLimit', update_ele2);
}
function togglePreps() {
	$('preps').style.display = $('preps').style.display == 'block' ? 'none' : 'block';
}
function setPreps(frm) {
	nr_limit = frm.limit.value;
	max_count = frm.maxc.value;
	max_count_u = frm.maxu.value;
	updateInterval = frm.interval.value;
	no_since_id = !frm.since_check.checked;
	no_counter = !frm.counter.checked;
	no_resize_fst = !frm.resize_fst.checked;
	replies_in_tl = frm.replies_in_tl.checked;
	footer = new String(frm.footer.value);
	decr_enter = frm.decr_enter.checked;
	resetUpdateTimer();
	writeCookie('ver', 8, 3652);
	writeCookie('limit', nr_limit, 3652);
	writeCookie('max_count', max_count, 3652);
	writeCookie('max_count_u', max_count_u, 3652);
	writeCookie('update_interval', updateInterval, 3652);
	writeCookie('no_since_id', no_since_id?1:0, 3652);
	writeCookie('no_counter', no_counter?1:0, 3652);
	writeCookie('no_resize_fst', no_resize_fst?1:0, 3652);
	writeCookie('replies_in_tl', replies_in_tl?1:0, 3652);
	writeCookie('footer', footer, 3652);
	writeCookie('decr_enter', decr_enter?1:0, 3652);
	writeCookie('tw_plugins', new String(" " + frm.list.value), 3652);
	writeCookie('user_style', new String(frm.user_style.value), 3652);
	callPlugins('savePrefs', frm);
	alert("Your settings are saved. Please reload to apply plugins and CSS.");
}
// 初期化
function init() {
	setTimeout(function(){scrollTo(0, 1)}, 0);
	// 初回アップデート
	update = update_inited; // 初期化前にupdateが発生するのを防止
	callPlugins("init");
	setTimeout(auth, 0);
}
// プラグイン
function registerPlugin(obj) {
	plugins.push(obj);
}
function callPlugins(name) {
	var args = [].slice.apply(arguments);
	args.shift();
	for (var i in plugins)
		if (typeof plugins[i][name] == "function")
			plugins[i][name].apply(plugins[i], args);
}
if (pluginstr) {
	var st = '<scr'+'ipt type="text/javascript" src="';
	var ed = '"></scr'+'ipt>';
	document.write(st + pluginstr.split("\n").join(ed+st) + ed);
}
