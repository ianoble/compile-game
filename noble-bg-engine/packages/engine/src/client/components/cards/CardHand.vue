<script setup lang="ts">
import { useGame } from "../../composables/useGame.js";
import { isCardHidden } from "../../../types/index.js";
import type { Card, VisibleCard } from "../../../types/index.js";
import CardComponent from "./CardComponent.vue";

const props = withDefaults(
	defineProps<{
		cards: Card[];
		/** Card arrangement: 'fan' (overlapping arc), 'splayed' (gentle arc), or 'flat' (no transform). */
		layout?: "fan" | "splayed" | "flat";
		/** Maximum rotation angle (degrees) at the edges of the arc. */
		maxAngle?: number;
		/** Allow cards to be dragged from this hand. */
		draggable?: boolean;
	}>(),
	{
		layout: "fan",
		maxAngle: 25,
		draggable: true,
	}
);

defineEmits<{
	(e: "select", index: number): void;
}>();

const { isMyTurn } = useGame();

function cardStyle(index: number, total: number): Record<string, string> {
	if (props.layout === "flat" || total <= 1) return {};

	const mid = (total - 1) / 2;
	const offset = index - mid;
	const normalised = mid === 0 ? 0 : offset / mid;

	if (props.layout === "splayed") {
		const rotate = normalised * Math.min(props.maxAngle, 15);
		const lift = normalised * normalised * 12;
		return {
			"--fan-rotate": `${rotate}deg`,
			"--fan-y": `${lift}px`,
			"--fan-z": `${index}`,
			marginLeft: index === 0 ? "0" : "-8px",
		};
	}

	// Fan layout (default)
	const rotate = normalised * props.maxAngle;
	const lift = Math.abs(normalised) * 24;
	const overlap = total <= 5 ? -16 : -22;
	return {
		"--fan-rotate": `${rotate}deg`,
		"--fan-y": `${lift}px`,
		"--fan-z": `${index}`,
		marginLeft: index === 0 ? "0" : `${overlap}px`,
	};
}
</script>

<template>
	<div class="hand-perspective">
		<TransitionGroup name="hand-card" tag="div" class="card-hand" :class="[layout, { active: isMyTurn }]">
			<div
				v-for="(card, i) in cards"
				:key="isCardHidden(card) ? `hidden-${i}` : (card as VisibleCard).id"
				class="hand-slot"
				:style="cardStyle(i, cards.length)"
				@click="$emit('select', i)"
			>
				<CardComponent :card="card" :draggable="draggable && !isCardHidden(card)" source-id="hand" :source-index="i">
					<template #default="{ card: visibleCard }">
						<slot name="card" :card="visibleCard" :index="i">
							<span class="fallback-label">{{ visibleCard.id }}</span>
						</slot>
					</template>
				</CardComponent>
			</div>
		</TransitionGroup>
	</div>
</template>

<style scoped>
.hand-perspective {
	perspective: 1000px;
}

.card-hand {
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 1.5rem 2rem 0.75rem;
}

.card-hand.active .hand-slot {
	filter: brightness(1.08);
}

.hand-slot {
	transform: rotate(var(--fan-rotate, 0deg)) translateY(var(--fan-y, 0px));
	transform-origin: center 160%;
	z-index: var(--fan-z, 0);
	transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), margin 0.35s ease, filter 0.2s ease;
}

.card-hand.splayed .hand-slot {
	transform-origin: center 110%;
}

.hand-slot:hover {
	z-index: 100;
}

.fallback-label {
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--text);
}

/* --- TransitionGroup --- */
.hand-card-enter-active {
	transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.hand-card-leave-active {
	transition: all 0.3s cubic-bezier(0.5, 0, 1, 0.5);
	position: absolute;
}
.hand-card-enter-from {
	opacity: 0;
	transform: translateY(40px) scale(0.6) rotate(var(--fan-rotate, 0deg));
}
.hand-card-leave-to {
	opacity: 0;
	transform: translateY(-24px) scale(0.6) rotateY(90deg);
}
.hand-card-move {
	transition: transform 0.35s ease;
}
</style>
