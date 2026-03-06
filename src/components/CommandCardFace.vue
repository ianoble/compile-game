<script setup lang="ts">
import { computed } from 'vue';
import type { CommandCardAbility } from '../logic/compile-cards';

const props = defineProps<{
	value: number;
	/** Protocol name shown at top (e.g. "Spirit"); when set, used instead of name. */
	protocol?: string;
	name: string;
	top?: CommandCardAbility | null;
	middle?: CommandCardAbility | null;
	bottom?: CommandCardAbility | null;
}>();

const abilityRows = computed(() => [
	{ key: 'top', ability: props.top },
	{ key: 'middle', ability: props.middle },
	{ key: 'bottom', ability: props.bottom },
]);
</script>

<template>
	<div class="command-card-face flex flex-col gap-0.5 w-full h-full min-h-0 p-1">
		<!-- Row 1: value (top-left, bordered) + protocol or name (right) -->
		<div class="flex items-center gap-1.5 shrink-0 min-h-0">
			<span class="command-card-value">{{ value }}</span>
			<span class="command-card-name">{{ protocol ?? name }}</span>
		</div>
		<!-- Rows 2–4: top, middle, bottom abilities in borders -->
		<div
			v-for="{ key, ability } in abilityRows"
			:key="key"
			class="command-card-ability flex-1 min-h-0"
		>
			<template v-if="ability && (ability.emphasis || ability.text)">
				<span v-if="ability.emphasis" class="command-card-ability-emphasis">{{ ability.emphasis }} </span>
				{{ ability.text }}
			</template>
			<template v-else>—</template>
		</div>
	</div>
</template>
