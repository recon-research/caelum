import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { CaeCard } from 'caelum/card';
import { CaeTreeSelect } from 'caelum/tree-select';
import type { CaeTreeNode } from 'caelum/tree';

// A small, deterministic workspace-resource hierarchy (no Math.random / Date.now — the
// reproducible-build rule). A node's `value` is its selection KEY; the group nodes carry keys too,
// so they are selectable as well as expandable (a real p-treeSelect allows selecting any node).
const RESOURCES: readonly CaeTreeNode[] = [
  {
    value: 'ws',
    label: 'Workspace',
    children: [
      {
        value: 'projects',
        label: 'Projects',
        children: [
          { value: 'web', label: 'Web App' },
          { value: 'api', label: 'API Service' },
          { value: 'mobile', label: 'Mobile App' },
        ],
      },
      {
        value: 'environments',
        label: 'Environments',
        children: [
          { value: 'prod', label: 'Production' },
          { value: 'staging', label: 'Staging' },
          { value: 'dev', label: 'Development' },
        ],
      },
      { value: 'settings', label: 'Settings' },
    ],
  },
];

/**
 * The deferred `cae-tree-select` demo (#279) — the ★ value-picker family's tree control. It shows the
 * control end-to-end in three modes: a SINGLE-select "Move to folder" whose value is one node key, a
 * MULTIPLE-select "Grant access to" whose value is a key array, and a CHECKBOX-select "Scope of access"
 * (#280) with tri-state parent↔child propagation — checking a parent checks its subtree, a partially-
 * checked parent goes indeterminate, and the value is the canonical set of fully-checked keys. Each
 * `<code>` readback is driven off the bound `FormControl`'s `valueChanges` (via `toSignal`) — proof the
 * value is the node KEY (not the visible label) and that selection round-trips live. All start with a
 * written value (proving `writeValue`; the checkbox one starts partially checked to show indeterminate).
 *
 * `@defer`'d from App (#85): the tree-select panel pulls in the CDK overlay + a11y modules, so keeping
 * it in its own lazy chunk holds those bytes off Forge's initial bundle (the #142 / D-16 budget).
 */
@Component({
  selector: 'app-tree-select-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CaeCard, CaeTreeSelect, ReactiveFormsModule],
  templateUrl: './tree-select-demo.html',
  styleUrl: './tree-select-demo.scss',
})
export class TreeSelectDemo {
  protected readonly resources = RESOURCES;

  /** Single-select: one node key. Pre-set to a valid key to show `writeValue` resolving to its label. */
  protected readonly single = new FormControl<string | null>('web');
  /** Multiple-select: a node-key array. Pre-set to show the summarized trigger + array value seam. */
  protected readonly multi = new FormControl<string[]>(['prod', 'staging']);
  /**
   * Checkbox-select (#280): tri-state propagation. Pre-set to two of Projects' three leaves so the
   * parent starts INDETERMINATE — checking the third rolls it (and its key) up into the value.
   */
  protected readonly checkbox = new FormControl<string[]>(['web', 'api']);

  // Reactive readbacks (toSignal markForChecks the OnPush host when the control emits — liveness).
  private readonly singleValue = toSignal(this.single.valueChanges, {
    initialValue: this.single.value,
  });
  private readonly multiValue = toSignal(this.multi.valueChanges, {
    initialValue: this.multi.value,
  });
  private readonly checkboxValue = toSignal(this.checkbox.valueChanges, {
    initialValue: this.checkbox.value,
  });

  protected readonly singleText = computed(() => this.singleValue() || '—');
  protected readonly multiText = computed(() => {
    const values = this.multiValue();
    return values && values.length ? values.join(', ') : '—';
  });
  protected readonly checkboxText = computed(() => {
    const values = this.checkboxValue();
    return values && values.length ? values.join(', ') : '—';
  });
}
