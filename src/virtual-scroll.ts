import {
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgModule,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  NgZone,
  ChangeDetectorRef
} from "@angular/core";

export interface IChangeEvent {
  start?: number;
  end?: number;
}

@Component({
  selector: "virtual-scroll,[virtualScroll]",
  exportAs: "virtualScroll",
  template: `
<div class="total-padding" [style.height]="scrollHeight + 'px'"></div>
<div class="scrollable-content" #content [style.transform]="'translateY(' + topPadding + 'px)'"
 [style.webkitTransform]="'translateY(' + topPadding + 'px)'">
  <ng-content></ng-content>
</div>
`,
  host: {
      "[style.overflow-y]": "parentScroll ? 'hidden' : 'auto'"
  },
  // ReSharper disable once CssBrowserCompatibility
  styles: [`
:host {
  overflow: hidden;
  position: relative;
  display: block;
  -webkit-overflow-scrolling: touch;
}
.scrollable-content {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  position: absolute;
}
.total-padding {
  width: 1px;
  opacity: 0;
}
`]
})
export class VirtualScrollComponent implements OnInit, OnChanges, OnDestroy {

  @Input()
  public items: any[] = [];

  @Input()
  public scrollbarWidth: number;

  @Input()
  public scrollbarHeight: number;

  @Input()
  public childWidth: number;

  @Input()
  public childHeight: number;

  @Input()
  public bufferAmount: number = 0;

  @Input()
  public toggleChangeDetection: EventEmitter<boolean>; // true change detection on

  private refreshHandler = () => {
      this.refresh();
  };

  private _parentScroll: Element | Window;

  @Input()
  public set parentScroll(element: Element | Window) {
      if (this._parentScroll === element) {
          return;
      }
      this.removeParentEventHandlers(this._parentScroll);
      this._parentScroll = element;
      this.addParentEventHandlers(this._parentScroll);
  }

  public get parentScroll(): Element | Window {
      return this._parentScroll;
  }

  @Output()
  public update = new EventEmitter<any[]>();

  public viewPortItems: any[];

  @Output()
  public change = new EventEmitter<IChangeEvent>();

  @Output()
  public start = new EventEmitter<IChangeEvent>();

  @Output()
  public end = new EventEmitter<IChangeEvent>();

  @ViewChild("content", { read: ElementRef })
  public contentElementRef: ElementRef;

  @ContentChild("container")
  public containerElementRef: ElementRef;

  public topPadding: number;
  public scrollHeight: number;
  public previousStart: number;
  public previousEnd: number;
  public startupLoop: boolean = true;
  public window = window;

  constructor(
      private readonly element: ElementRef,
      private readonly zone: NgZone,
      private readonly changeDetector: ChangeDetectorRef
  ) { }

  @HostListener("scroll")
  public onScroll() {
      this.refresh();
  }

  public ngOnInit() {
      this.toggleChangeDetection.subscribe((on: boolean) => {
          if (on) {
              this.changeDetector.reattach();
              this.startupLoop = true;
              this.calculateDimensions();
          } else {
              this.changeDetector.detach();
          }
      });

      this.scrollbarWidth = 0;
      this.scrollbarHeight = 0;
  }

  public ngOnDestroy() {
      this.removeParentEventHandlers(this.parentScroll);
  }

  public ngOnChanges(changes: SimpleChanges) {
      this.previousStart = undefined;
      this.previousEnd = undefined;
      const items = (changes as any).items || {};
      if ((changes as any).items != undefined && items.previousValue == undefined || (items.previousValue != undefined && items.previousValue.length === 0)) {
          this.startupLoop = true;
      }
      this.refresh();
  }

  public refresh() {
      this.zone.runOutsideAngular(() => {
          requestAnimationFrame(() => this.calculateItems());
      });
  }

  public scrollInto(item: any) {
      const el: Element = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;
      const offsetTop = this.getElementsOffset();
      const index: number = (this.items || []).indexOf(item);

      if (index < 0 || index >= (this.items || []).length) { return; }

      const d = this.calculateDimensions();
      el.scrollTop = (Math.floor(index / d.itemsPerRow) * d.childHeight) - (d.childHeight * Math.min(index, this.bufferAmount));
      this.refresh();
  }

  private addParentEventHandlers(parentScroll: Element | Window) {
      if (parentScroll) {
          parentScroll.addEventListener("scroll", this.refreshHandler);
          if (parentScroll instanceof Window) {
              parentScroll.addEventListener("resize", this.refreshHandler);
          }
      }
  }

  private removeParentEventHandlers(parentScroll: Element | Window) {
      if (parentScroll) {
          parentScroll.removeEventListener("scroll", this.refreshHandler);
          if (parentScroll instanceof Window) {
              parentScroll.removeEventListener("resize", this.refreshHandler);
          }
      }
  }

  private countItemsPerRow() {
      let offsetTop;
      let itemsPerRow;
      let children = this.contentElementRef.nativeElement.children;
      for (itemsPerRow = 0; itemsPerRow < children.length; itemsPerRow++) {
          if (offsetTop != undefined && offsetTop !== children[itemsPerRow].offsetTop) break;
          offsetTop = children[itemsPerRow].offsetTop;
      }
      return itemsPerRow;
  }

  private getElementsOffset(): number {
      let offsetTop = 0;

      if (this.containerElementRef && this.containerElementRef.nativeElement) {
          offsetTop += this.containerElementRef.nativeElement.offsetTop;
      }

      if (this.parentScroll) {
          offsetTop += this.element.nativeElement.offsetTop;
      }

      return offsetTop;
  }

  private calculateDimensions() {
      const el: Element = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;
      const items = this.items || [];
      const itemCount = items.length;
      const viewWidth = el.clientWidth - this.scrollbarWidth;
      const viewHeight = el.clientHeight - this.scrollbarHeight;

      let contentDimensions;
      if (this.childWidth == undefined || this.childHeight == undefined) {
          let content = this.contentElementRef.nativeElement as HTMLElement;
          if (this.containerElementRef && this.containerElementRef.nativeElement) {
              content = this.containerElementRef.nativeElement;
          }
          contentDimensions = content.children[0] ? content.children[0].getBoundingClientRect() : {
              width: viewWidth,
              height: viewHeight
          };
      }
      let childWidth = this.childWidth || contentDimensions.width;
      let childHeight = this.childHeight || contentDimensions.height;

      let itemsPerRow = Math.max(1, this.countItemsPerRow());

      let itemsPerRowByCalc = Math.max(1, Math.floor(viewWidth / childWidth));

      let itemsPerCol = Math.max(1, Math.floor(viewHeight / childHeight));
      let elScrollTop = this.parentScroll instanceof Window
          ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0)
          : el.scrollTop;
      let scrollTop = Math.max(0, elScrollTop);
      if (itemsPerCol === 1 && Math.floor(scrollTop / this.scrollHeight * itemCount) + itemsPerRowByCalc >= itemCount) {
          itemsPerRow = itemsPerRowByCalc;
      }

      return {
          itemCount: itemCount,
          viewWidth: viewWidth,
          viewHeight: viewHeight,
          childWidth: childWidth,
          childHeight: childHeight,
          itemsPerRow: itemsPerRow,
          itemsPerCol: itemsPerCol,
          itemsPerRowByCalc: itemsPerRowByCalc
      };
  }

  private calculateItems() {
      let el = this.parentScroll instanceof Window ? document.body : this.parentScroll || this.element.nativeElement;

      let d = this.calculateDimensions();
      let items = this.items || [];
      let offsetTop = this.getElementsOffset();
      let elScrollTop = this.parentScroll instanceof Window
          ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0)
          : el.scrollTop;
      this.scrollHeight = d.childHeight * d.itemCount / d.itemsPerRow;
      if (elScrollTop > this.scrollHeight) {
          elScrollTop = this.scrollHeight + offsetTop;
      }

      let scrollTop = Math.max(0, elScrollTop - offsetTop);
      let indexByScrollTop = scrollTop / this.scrollHeight * d.itemCount / d.itemsPerRow;
      let end = Math.min(d.itemCount, Math.ceil(indexByScrollTop) * d.itemsPerRow + d.itemsPerRow * (d.itemsPerCol + 1));

      let maxStartEnd = end;
      const modEnd = end % d.itemsPerRow;
      if (modEnd) {
          maxStartEnd = end + d.itemsPerRow - modEnd;
      }
      let maxStart = Math.max(0, maxStartEnd - d.itemsPerCol * d.itemsPerRow - d.itemsPerRow);
      let start = Math.min(maxStart, Math.floor(indexByScrollTop) * d.itemsPerRow);

      this.topPadding = d.childHeight * Math.ceil(start / d.itemsPerRow) - (d.childHeight * Math.min(start, this.bufferAmount));

      start = !isNaN(start) ? start : -1;
      end = !isNaN(end) ? end : -1;
      start -= this.bufferAmount;
      start = Math.max(0, start);
      end += this.bufferAmount;
      end = Math.min(items.length, end);

      if (end === -1) {
          end = 0;
      }

      if (start !== this.previousStart || end !== this.previousEnd) {

          // update the scroll list
          this.viewPortItems = items.slice(start, end);
          this.update.emit(this.viewPortItems);

          // emit 'start' event
          if (start !== this.previousStart && this.startupLoop === false) {
              this.start.emit({ start, end });
          }

          // emit 'end' event
          if (end !== this.previousEnd && this.startupLoop === false) {
              this.end.emit({ start, end });
          }

          this.previousStart = start;
          this.previousEnd = end;

          if (this.startupLoop === true) {
              this.refresh();
          } else {
              this.change.emit({ start, end });
          }

      } else if (this.startupLoop === true) {
          this.startupLoop = false;
          this.refresh();
      }
  }
}

@NgModule({
  exports: [VirtualScrollComponent],
  declarations: [VirtualScrollComponent]
})
export class VirtualScrollModule { }