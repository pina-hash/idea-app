<script lang="ts">
	import './brand';

	/**
	 * The GREENLINE master key art ("1A / IMPACT"), ported as live code from the
	 * art-direction reference: a floodlit rig yard at night, two chrome prototype
	 * machines frozen at the peak of a collision, an amber spark shower, one
	 * green signature thread. Authored in a fixed 1280x720 stage that scales to
	 * COVER its container (the title screen mounts it full-viewport behind the
	 * wordmark overlay; the wordmark itself is NOT part of this scene so it can
	 * stay responsive and uncropped).
	 *
	 * Everything here is presentation-only and static by design ("freeze the
	 * peak of the action"); the only motion is a slow ember drift, gated behind
	 * prefers-reduced-motion.
	 */
	let w = $state(0);
	let h = $state(0);
	const scale = $derived(Math.max(w / 1280, h / 720) || 1);
</script>

<div class="glb ka-viewport" bind:clientWidth={w} bind:clientHeight={h} aria-hidden="true">
	<div class="ka-stage" style:transform="translate(-50%, -50%) scale({scale})">
		<!-- Sky: night gradient + motivated glows (amber = the collision, cool = the rig) -->
		<div class="ka" style="inset:0;background:linear-gradient(#03050a 0%,#070b11 38%,#0d1319 55%,#10161c 63%,#070a0f 76%,#04070b 100%)"></div>
		<div class="ka" style="inset:0;background:radial-gradient(42% 38% at 74% 26%,rgba(255,150,40,0.13),transparent 70%)"></div>
		<div class="ka" style="inset:0;background:radial-gradient(42% 46% at 16% 38%,rgba(120,165,205,0.10),transparent 70%)"></div>

		<!-- Horizon band + distant yard structures -->
		<div class="ka" style="left:0;right:0;top:318px;height:88px;background:linear-gradient(rgba(6,10,14,0),#060a0e 45%,#05080c)"></div>
		<div class="ka" style="left:118px;top:192px;width:46px;height:150px;background:linear-gradient(#0a0e12,#070a0d)"></div>
		<div class="ka" style="left:172px;top:224px;width:28px;height:118px;background:linear-gradient(#090d11,#060a0d)"></div>
		<div class="ka" style="left:120px;top:150px;width:120px;height:60px;border-radius:50%;background:rgba(140,155,170,0.06);filter:blur(16px)"></div>
		<div class="ka" style="left:938px;top:176px;width:58px;height:166px;background:linear-gradient(#0a0e12,#070a0d)"></div>
		<div class="ka" style="left:1010px;top:212px;width:32px;height:130px;background:linear-gradient(#090d11,#060a0d)"></div>
		<div class="ka" style="left:950px;top:132px;width:130px;height:64px;border-radius:50%;background:rgba(255,170,90,0.06);filter:blur(18px)"></div>
		<div class="ka" style="left:960px;top:172px;width:4px;height:4px;border-radius:50%;background:#ffb86e;box-shadow:0 0 8px rgba(255,170,80,0.9)"></div>

		<!-- Floodlight towers: cool key left, warm right, with light cones -->
		<div class="ka" style="left:206px;top:128px;width:6px;height:212px;background:#0b0f13"></div>
		<div class="ka" style="left:190px;top:118px;width:38px;height:12px;background:#0d1216"></div>
		<div class="ka" style="left:195px;top:121px;width:5px;height:5px;border-radius:50%;background:#eaf4ff;box-shadow:0 0 10px rgba(220,238,255,0.9)"></div>
		<div class="ka" style="left:206px;top:121px;width:5px;height:5px;border-radius:50%;background:#eaf4ff;box-shadow:0 0 10px rgba(220,238,255,0.9)"></div>
		<div class="ka" style="left:217px;top:121px;width:5px;height:5px;border-radius:50%;background:#eaf4ff;box-shadow:0 0 10px rgba(220,238,255,0.9)"></div>
		<div class="ka" style="left:160px;top:92px;width:120px;height:60px;border-radius:50%;background:rgba(215,235,255,0.22);filter:blur(20px)"></div>
		<div class="ka" style="left:196px;top:126px;width:560px;height:430px;transform-origin:0 0;transform:rotate(24deg);clip-path:polygon(0% 0%,9% 0%,92% 100%,26% 100%);background:linear-gradient(rgba(215,232,250,0.15),rgba(215,232,250,0) 78%);mix-blend-mode:screen;filter:blur(7px);opacity:0.7;z-index:2"></div>
		<div class="ka" style="left:1062px;top:128px;width:6px;height:212px;background:#0b0f13"></div>
		<div class="ka" style="left:1046px;top:118px;width:38px;height:12px;background:#0d1216"></div>
		<div class="ka" style="left:1051px;top:121px;width:5px;height:5px;border-radius:50%;background:#fff3df;box-shadow:0 0 10px rgba(255,230,190,0.9)"></div>
		<div class="ka" style="left:1062px;top:121px;width:5px;height:5px;border-radius:50%;background:#fff3df;box-shadow:0 0 10px rgba(255,230,190,0.9)"></div>
		<div class="ka" style="left:1073px;top:121px;width:5px;height:5px;border-radius:50%;background:#fff3df;box-shadow:0 0 10px rgba(255,230,190,0.9)"></div>
		<div class="ka" style="left:1000px;top:92px;width:120px;height:60px;border-radius:50%;background:rgba(255,225,175,0.2);filter:blur(20px)"></div>
		<div class="ka" style="right:170px;top:124px;width:560px;height:430px;transform-origin:100% 0;transform:rotate(-24deg);clip-path:polygon(91% 0%,100% 0%,74% 100%,8% 100%);background:linear-gradient(rgba(255,225,180,0.12),rgba(255,225,180,0) 78%);mix-blend-mode:screen;filter:blur(7px);opacity:0.7;z-index:2"></div>

		<!-- Gantry with green track markers -->
		<div class="ka" style="left:300px;top:210px;width:712px;height:24px;background:linear-gradient(#0b0f13,#080c10);border-bottom:1px solid #1a2229;z-index:2"></div>
		<div class="ka" style="left:330px;top:234px;width:9px;height:78px;background:linear-gradient(#0a0e12,rgba(10,14,18,0));z-index:2"></div>
		<div class="ka" style="left:652px;top:234px;width:9px;height:78px;background:linear-gradient(#0a0e12,rgba(10,14,18,0));z-index:2"></div>
		<div class="ka" style="left:972px;top:234px;width:9px;height:78px;background:linear-gradient(#0a0e12,rgba(10,14,18,0));z-index:2"></div>
		{#each [602, 624, 646, 668, 690] as x (x)}
			<div class="ka" style="left:{x}px;top:220px;width:5px;height:5px;border-radius:50%;background:#2ae57e;box-shadow:0 0 9px rgba(42,229,126,0.9);z-index:2"></div>
		{/each}

		<!-- Ground plane + faint radiating skid streaks -->
		<div class="ka" style="left:0;right:0;top:400px;height:320px;background:linear-gradient(#0c1116 0%,#080c10 34%,#04070a 100%)"></div>
		<div class="ka" style="left:640px;top:470px;width:700px;height:2px;transform-origin:0 50%;transform:rotate(163deg);background:linear-gradient(90deg,rgba(150,175,195,0.2),transparent);filter:blur(1px)"></div>
		<div class="ka" style="left:640px;top:470px;width:700px;height:2px;transform-origin:0 50%;transform:rotate(17deg);background:linear-gradient(90deg,rgba(150,175,195,0.2),transparent);filter:blur(1px)"></div>
		<div class="ka" style="left:660px;top:452px;width:640px;height:2px;transform-origin:0 50%;transform:rotate(152deg);background:linear-gradient(90deg,rgba(150,175,195,0.13),transparent);filter:blur(1px)"></div>
		<div class="ka" style="left:620px;top:452px;width:640px;height:2px;transform-origin:0 50%;transform:rotate(28deg);background:linear-gradient(90deg,rgba(150,175,195,0.13),transparent);filter:blur(1px)"></div>

		<!-- Amber ground pool under the collision -->
		<div class="ka" style="left:360px;top:408px;width:580px;height:130px;border-radius:50%;background:radial-gradient(50% 50%,rgba(255,165,55,0.3),transparent 70%);mix-blend-mode:screen;z-index:3"></div>

		<!-- The green signature thread entering the frame -->
		<div class="ka" style="left:-60px;top:396px;width:470px;height:5px;background:linear-gradient(90deg,rgba(42,229,126,0),rgba(42,229,126,0.8) 72%,#d9ffe9);filter:blur(1.5px);box-shadow:0 0 16px rgba(42,229,126,0.7);z-index:3"></div>
		<div class="ka" style="left:-40px;top:468px;width:430px;height:12px;background:linear-gradient(90deg,rgba(42,229,126,0),rgba(42,229,126,0.28));filter:blur(9px);z-index:3"></div>

		<!-- Speed streaks off both edges -->
		<div class="ka" style="left:0;top:322px;width:420px;height:3px;background:linear-gradient(90deg,rgba(195,215,235,0.28),transparent);filter:blur(2px);z-index:4"></div>
		<div class="ka" style="left:0;top:356px;width:330px;height:2px;background:linear-gradient(90deg,rgba(195,215,235,0.2),transparent);filter:blur(2px);z-index:4"></div>
		<div class="ka" style="left:0;top:298px;width:260px;height:2px;background:linear-gradient(90deg,rgba(195,215,235,0.14),transparent);filter:blur(2px);z-index:4"></div>
		<div class="ka" style="right:0;top:302px;width:420px;height:3px;background:linear-gradient(270deg,rgba(195,215,235,0.28),transparent);filter:blur(2px);z-index:4"></div>
		<div class="ka" style="right:0;top:338px;width:330px;height:2px;background:linear-gradient(270deg,rgba(195,215,235,0.2),transparent);filter:blur(2px);z-index:4"></div>
		<div class="ka" style="right:0;top:270px;width:260px;height:2px;background:linear-gradient(270deg,rgba(195,215,235,0.14),transparent);filter:blur(2px);z-index:4"></div>

		<!-- Contact shadows -->
		<div class="ka" style="left:280px;top:448px;width:360px;height:38px;border-radius:50%;background:rgba(0,0,0,0.62);filter:blur(13px);z-index:4"></div>
		<div class="ka" style="left:680px;top:444px;width:370px;height:40px;border-radius:50%;background:rgba(0,0,0,0.62);filter:blur(13px);z-index:4"></div>

		<!-- Machine GRN-07 (left, carrying the green underglow) -->
		<div class="ka" style="left:236px;top:296px;width:420px;height:190px;transform:rotate(2.5deg);z-index:5">
			<div class="ka" style="inset:0;clip-path:polygon(0% 62%,10% 42%,30% 30%,58% 22%,82% 28%,100% 58%,97% 74%,74% 86%,30% 88%,4% 76%);background:linear-gradient(100deg,#0b1116,#3c4650 45%,#10161c);filter:blur(15px);transform:translateX(-72px) scaleX(1.16);opacity:0.55"></div>
			<div class="ka" style="inset:0;clip-path:polygon(0% 62%,10% 42%,30% 30%,58% 22%,82% 28%,100% 58%,97% 74%,74% 86%,30% 88%,4% 76%);background:linear-gradient(102deg,#05080c 6%,#242e37 15%,#dfe9f1 20%,#3f4a54 26%,#0e141a 38%,#8d9ba8 52%,#0a0f14 64%,#39434d 78%,#060a0e 92%)"></div>
			<div class="ka" style="left:34%;top:16%;width:27%;height:36%;clip-path:polygon(0% 78%,18% 18%,78% 0%,100% 62%,58% 100%);background:linear-gradient(115deg,#0b1116 22%,#3d4d5c 46%,#9fb6c8 53%,#141c23 62%)"></div>
			<div class="ka" style="left:33%;top:30%;width:26%;height:2px;transform:rotate(-13deg);background:linear-gradient(90deg,transparent,#eaf6ff,transparent);filter:blur(0.4px)"></div>
			<div class="ka" style="right:9%;top:4%;width:12%;height:32%;clip-path:polygon(0% 100%,58% 0%,100% 10%,80% 100%);background:linear-gradient(100deg,#0a0f14,#5a6873 60%,#11181e)"></div>
			<div class="ka" style="left:5%;bottom:21%;width:58%;height:5px;transform:rotate(-4deg);border-radius:3px;background:linear-gradient(90deg,rgba(42,229,126,0),#2ae57e 44%,#c8ffe2);box-shadow:0 0 14px rgba(42,229,126,0.85)"></div>
			<div class="ka ka-decal" style="left:39%;bottom:26%;transform:rotate(-3deg)">GRN·07</div>
			<div class="ka" style="right:-2%;top:42%;width:23%;height:40%;clip-path:polygon(0% 22%,100% 0%,100% 100%,10% 88%);background:linear-gradient(80deg,rgba(255,176,46,0) 28%,rgba(255,176,46,0.85));filter:blur(3px);mix-blend-mode:screen"></div>
			<div class="ka" style="right:2%;top:52%;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,#fff,#ffcf8a 60%,transparent);filter:blur(1px)"></div>
		</div>

		<!-- Machine KSK-13 (right, catching the amber flash) -->
		<div class="ka" style="left:648px;top:238px;width:430px;height:212px;transform:rotate(-8deg);z-index:5">
			<div class="ka" style="inset:0;clip-path:polygon(100% 62%,90% 40%,68% 26%,40% 20%,16% 30%,0% 58%,3% 76%,26% 88%,68% 86%,96% 76%);background:linear-gradient(260deg,#0b1116,#3c4650 45%,#10161c);filter:blur(15px);transform:translateX(70px) scaleX(1.16);opacity:0.55"></div>
			<div class="ka" style="inset:0;clip-path:polygon(100% 62%,90% 40%,68% 26%,40% 20%,16% 30%,0% 58%,3% 76%,26% 88%,68% 86%,96% 76%);background:linear-gradient(262deg,#05080c 6%,#242e37 15%,#dfe9f1 20%,#3f4a54 26%,#0e141a 38%,#8d9ba8 52%,#0a0f14 64%,#39434d 78%,#060a0e 92%)"></div>
			<div class="ka" style="left:38%;top:14%;width:27%;height:36%;clip-path:polygon(100% 78%,82% 18%,22% 0%,0% 62%,42% 100%);background:linear-gradient(245deg,#0b1116 22%,#3d4d5c 46%,#9fb6c8 53%,#141c23 62%)"></div>
			<div class="ka" style="left:42%;top:28%;width:24%;height:2px;transform:rotate(12deg);background:linear-gradient(90deg,transparent,#eaf6ff,transparent);filter:blur(0.4px)"></div>
			<div class="ka" style="right:14%;top:0;width:13%;height:30%;clip-path:polygon(20% 100%,0% 12%,44% 0%,100% 90%);background:linear-gradient(250deg,#0a0f14,#5a6873 60%,#11181e)"></div>
			<div class="ka" style="right:5%;bottom:-6%;width:56px;height:56px;border-radius:50%;background:conic-gradient(#141a20,#394349 25%,#171e24 50%,#394349 75%,#141a20);filter:blur(1.6px)"></div>
			<div class="ka" style="right:8.6%;bottom:6%;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#5e6c78,#121d1d 70%)"></div>
			<div class="ka" style="right:1%;top:32%;width:6px;height:6px;border-radius:50%;background:#ffd9a0;box-shadow:0 0 8px rgba(255,190,110,0.9)"></div>
			<div class="ka" style="right:1%;top:44%;width:6px;height:6px;border-radius:50%;background:#ffd9a0;box-shadow:0 0 8px rgba(255,190,110,0.9)"></div>
			<div class="ka ka-decal" style="left:44%;bottom:22%;transform:rotate(3deg);opacity:0.8">KSK·13</div>
			<div class="ka" style="left:-1%;top:24%;width:26%;height:60%;clip-path:polygon(0% 30%,100% 0%,80% 100%,0% 88%);background:linear-gradient(265deg,rgba(255,176,46,0.8),rgba(255,176,46,0) 70%);filter:blur(4px);mix-blend-mode:screen"></div>
		</div>

		<!-- Dark pool framing the lower third (the wordmark overlay sits here) -->
		<div class="ka" style="left:65px;top:452px;width:1150px;height:230px;border-radius:50%;background:radial-gradient(50% 50%,rgba(2,4,6,0.74),transparent 72%);filter:blur(14px);z-index:5"></div>

		<!-- Impact flash: layered radial + light lances, all screen-blend -->
		<div class="ka" style="left:518px;top:258px;width:264px;height:226px;background:radial-gradient(46% 42% at 50% 52%,#fff 0%,#ffe7c2 15%,rgba(255,170,60,0.55) 38%,rgba(255,140,30,0.18) 60%,transparent 74%);mix-blend-mode:screen;z-index:7"></div>
		<div class="ka" style="left:322px;top:364px;width:650px;height:4px;background:linear-gradient(90deg,transparent,#ffe9c8 50%,transparent);filter:blur(1px);mix-blend-mode:screen;z-index:7"></div>
		<div class="ka" style="left:352px;top:356px;width:590px;height:20px;background:linear-gradient(90deg,transparent,rgba(255,210,150,0.55) 50%,transparent);filter:blur(10px);mix-blend-mode:screen;z-index:7"></div>
		<div class="ka" style="left:646px;top:282px;width:3px;height:180px;background:linear-gradient(transparent,#ffe9c8 50%,transparent);filter:blur(1px);opacity:0.7;mix-blend-mode:screen;z-index:7"></div>
		<div class="ka" style="left:576px;top:300px;width:150px;height:2px;transform:rotate(45deg);background:linear-gradient(90deg,transparent,#fff,transparent);opacity:0.6;mix-blend-mode:screen;z-index:7"></div>
		<div class="ka" style="left:576px;top:432px;width:150px;height:2px;transform:rotate(-45deg);background:linear-gradient(90deg,transparent,#fff,transparent);opacity:0.6;mix-blend-mode:screen;z-index:7"></div>

		<!-- Frozen spark shower from the collision origin -->
		<svg viewBox="0 0 1280 720" class="ka-sparks">
			<defs>
				<filter id="glb-spark-glow" x="-40%" y="-40%" width="180%" height="180%">
					<feGaussianBlur stdDeviation="1.4" result="b" />
					<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
			</defs>
			<g filter="url(#glb-spark-glow)" stroke-linecap="round" fill="none">
				<line x1="650" y1="372" x2="520" y2="238" stroke="#ffd9a0" stroke-width="2.5" />
				<line x1="650" y1="372" x2="556" y2="210" stroke="#ffb02e" stroke-width="1.6" />
				<line x1="650" y1="372" x2="606" y2="188" stroke="#ffe9c8" stroke-width="2" />
				<line x1="650" y1="372" x2="470" y2="318" stroke="#ff9b2e" stroke-width="2.2" />
				<line x1="650" y1="372" x2="428" y2="352" stroke="#ffb02e" stroke-width="1.4" stroke-opacity=".8" />
				<line x1="650" y1="372" x2="760" y2="212" stroke="#ffd9a0" stroke-width="2.4" />
				<line x1="650" y1="372" x2="808" y2="262" stroke="#ffb02e" stroke-width="1.8" />
				<line x1="650" y1="372" x2="854" y2="318" stroke="#ff9b2e" stroke-width="2.4" />
				<line x1="650" y1="372" x2="700" y2="180" stroke="#ffe9c8" stroke-width="1.4" />
				<line x1="650" y1="372" x2="888" y2="354" stroke="#ffb02e" stroke-width="1.5" stroke-opacity=".85" />
				<line x1="650" y1="372" x2="944" y2="298" stroke="#ff9b2e" stroke-width="1.2" stroke-opacity=".7" />
				<line x1="650" y1="372" x2="556" y2="470" stroke="#ffd9a0" stroke-width="2" />
				<line x1="650" y1="372" x2="498" y2="522" stroke="#ffb02e" stroke-width="1.6" />
				<line x1="650" y1="372" x2="762" y2="472" stroke="#ffd9a0" stroke-width="2.2" />
				<line x1="650" y1="372" x2="822" y2="542" stroke="#ff9b2e" stroke-width="1.7" />
				<line x1="650" y1="372" x2="906" y2="588" stroke="#ffb02e" stroke-width="1.4" stroke-opacity=".85" />
				<line x1="650" y1="372" x2="452" y2="546" stroke="#ff9b2e" stroke-width="1.3" stroke-opacity=".8" />
				<line x1="650" y1="372" x2="386" y2="470" stroke="#ffb02e" stroke-width="1.2" stroke-opacity=".7" />
				<line x1="650" y1="372" x2="298" y2="358" stroke="#ff9b2e" stroke-width="1" stroke-opacity=".55" />
				<line x1="650" y1="372" x2="1014" y2="396" stroke="#ffb02e" stroke-width="1.1" stroke-opacity=".6" />
				<line x1="650" y1="372" x2="610" y2="330" stroke="#ffffff" stroke-width="3" />
				<line x1="650" y1="372" x2="692" y2="328" stroke="#ffffff" stroke-width="3" />
				<line x1="650" y1="372" x2="640" y2="300" stroke="#ffffff" stroke-width="2.4" />
				<line x1="650" y1="372" x2="668" y2="422" stroke="#ffffff" stroke-width="2.6" />
				<line x1="650" y1="372" x2="616" y2="418" stroke="#fff4e2" stroke-width="2.2" />
				<path d="M650,372 Q820,326 902,468" stroke="#ffb02e" stroke-width="1.6" stroke-opacity=".85" />
				<path d="M650,372 Q500,298 432,442" stroke="#ff9b2e" stroke-width="1.4" stroke-opacity=".8" />
				<path d="M650,372 Q744,258 838,240" stroke="#ffd9a0" stroke-width="1.3" stroke-opacity=".7" />
			</g>
			<g fill="#ffca7a">
				<circle cx="585" cy="266" r="2.4" /><circle cx="722" cy="238" r="2" />
				<circle cx="792" cy="300" r="2.6" /><circle cx="518" cy="320" r="1.8" />
				<circle cx="842" cy="382" r="2.2" /><circle cx="758" cy="432" r="1.8" />
				<circle cx="558" cy="432" r="2" /><circle cx="876" cy="470" r="1.6" />
				<circle cx="478" cy="396" r="1.6" /><circle cx="906" cy="542" r="1.8" />
				<circle cx="948" cy="608" r="1.4" /><circle cx="418" cy="580" r="1.5" />
			</g>
		</svg>

		<!-- Thrown debris + hot fragments -->
		<div class="ka" style="left:498px;top:296px;width:88px;height:3px;transform:rotate(-26deg);background:linear-gradient(90deg,transparent,rgba(215,228,242,0.4));filter:blur(2.5px);z-index:8"></div>
		<div class="ka" style="left:556px;top:288px;width:26px;height:18px;transform:rotate(18deg);clip-path:polygon(0% 42%,58% 0%,100% 55%,36% 100%);background:linear-gradient(120deg,#232c34,#0d1318);z-index:8"></div>
		<div class="ka" style="left:712px;top:252px;width:80px;height:3px;transform:rotate(24deg);background:linear-gradient(270deg,transparent,rgba(215,228,242,0.4));filter:blur(2.5px);z-index:8"></div>
		<div class="ka" style="left:758px;top:262px;width:22px;height:16px;transform:rotate(-30deg);clip-path:polygon(0% 30%,64% 0%,100% 62%,28% 100%);background:linear-gradient(250deg,#28323b,#0d1318);z-index:8"></div>
		<div class="ka" style="left:700px;top:468px;width:13px;height:10px;transform:rotate(40deg);clip-path:polygon(0% 40%,60% 0%,100% 58%,30% 100%);background:#141b21;z-index:8"></div>
		<div class="ka" style="left:452px;top:508px;width:60px;height:2px;transform:rotate(32deg);background:linear-gradient(90deg,transparent,rgba(255,196,120,0.5));filter:blur(1.5px);z-index:8"></div>
		<div class="ka" style="left:498px;top:520px;width:20px;height:15px;transform:rotate(-14deg);clip-path:polygon(0% 36%,58% 0%,100% 60%,32% 100%);background:linear-gradient(130deg,#1b242c,#0a0f14);box-shadow:0 0 0 1px rgba(255,176,46,0.18);z-index:8"></div>

		<!-- Atmosphere pools + near-black dust framing -->
		<div class="ka" style="left:540px;top:220px;width:320px;height:170px;border-radius:50%;background:rgba(185,196,210,0.10);z-index:8"></div>
		<div class="ka" style="left:730px;top:330px;width:300px;height:170px;border-radius:50%;background:rgba(255,175,85,0.09);z-index:8"></div>
		<div class="ka" style="left:-90px;top:556px;width:430px;height:210px;border-radius:50%;background:rgba(6,8,11,0.85);z-index:8"></div>
		<div class="ka" style="left:1040px;top:590px;width:340px;height:190px;border-radius:50%;background:rgba(6,8,11,0.7);z-index:8"></div>

		<!-- Drifting embers over the lower third (only motion in the frame) -->
		<div class="ka ka-ember" style="left:812px;top:500px;width:4px;height:4px;background:#ffca7a;box-shadow:0 0 8px rgba(255,180,90,0.9);animation-delay:0s"></div>
		<div class="ka ka-ember" style="left:902px;top:548px;width:3px;height:3px;background:#ffd9a0;box-shadow:0 0 7px rgba(255,190,110,0.9);animation-delay:-3.4s"></div>
		<div class="ka ka-ember" style="left:1008px;top:600px;width:4px;height:4px;background:#ffb95e;box-shadow:0 0 8px rgba(255,170,70,0.9);animation-delay:-6.2s"></div>
		<div class="ka ka-ember" style="left:742px;top:612px;width:3px;height:3px;background:#ffca7a;box-shadow:0 0 7px rgba(255,180,90,0.85);animation-delay:-8.8s"></div>
		<div class="ka ka-ember" style="left:352px;top:520px;width:3px;height:3px;background:#ffd9a0;box-shadow:0 0 7px rgba(255,190,110,0.8);animation-delay:-1.7s"></div>

		<!-- Heavy vignette + film grain, per the craft rules -->
		<div class="ka" style="inset:0;background:radial-gradient(115% 95% at 50% 40%,transparent 52%,rgba(0,0,0,0.5) 88%,rgba(0,0,0,0.74) 100%);z-index:9"></div>
		<svg class="ka-grain"><filter id="glb-grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" /></filter><rect width="100%" height="100%" filter="url(#glb-grain)" /></svg>
	</div>
</div>

<style>
	.ka-viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #04060a;
	}
	.ka-stage {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1280px;
		height: 720px;
		isolation: isolate;
	}
	.ka {
		position: absolute;
		pointer-events: none;
	}
	.ka-decal {
		font: italic 600 15px var(--glb-font-ui);
		letter-spacing: 0.1em;
		color: #cfe0ea;
		opacity: 0.85;
	}
	.ka-sparks {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 8;
		pointer-events: none;
	}
	.ka-ember {
		border-radius: 50%;
		z-index: 8;
	}
	.ka-grain {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0.08;
		mix-blend-mode: overlay;
		z-index: 10;
		pointer-events: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.ka-ember {
			animation: glb-ember-drift 11s linear infinite;
		}
	}
	@keyframes glb-ember-drift {
		0% {
			transform: translate(0, 0);
			opacity: 1;
		}
		80% {
			opacity: 0.9;
		}
		100% {
			transform: translate(26px, -130px);
			opacity: 0;
		}
	}
</style>
