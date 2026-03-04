<script setup lang="ts">
import { watch } from "vue";
import { setServerUrl, setDebug } from "../stores/game.js";
import { provideToastContext } from "../composables/useToast.js";
import { provideCardInspect } from "../composables/useCardInspect.js";
import { provideCardDrag } from "../composables/useCardDrag.js";
import { provideGameContext } from "../composables/useGame.js";
import ToastOverlay from "./ToastOverlay.vue";
import CardInspector from "../components/cards/CardInspector.vue";
import DragOverlay from "../components/cards/DragOverlay.vue";

const props = withDefaults(defineProps<{ serverUrl?: string; debug?: boolean }>(), {
	serverUrl: "",
	debug: false,
});

setServerUrl(props.serverUrl);
setDebug(props.debug);
watch(
	() => props.serverUrl,
	(url) => setServerUrl(url)
);
watch(
	() => props.debug,
	(val) => setDebug(val)
);

const toast = provideToastContext();
provideCardInspect();
provideCardDrag();
provideGameContext(toast);
</script>

<template>
	<slot />
	<ToastOverlay />
	<CardInspector />
	<DragOverlay />
</template>
