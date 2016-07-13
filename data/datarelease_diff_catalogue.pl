#!/usr/bin/perl

use JSON;
use strict;

my $ref_json = $ARGV[0];
my $cmp_json = $ARGV[1];

print "Comparing $cmp_json to $ref_json\n";

if (!-e $ref_json || !-e $cmp_json) {
    die "Unable to load one of the catalogues.\n";
}

open(C, $ref_json);
my $cattxt = <C>;
close(C);
my $ref_catalogue = from_json $cattxt;

open(C, $cmp_json);
$cattxt = <C>;
close(C);
my $cmp_catalogue = from_json $cattxt;

my @ref_sources = keys %{$ref_catalogue};
my @cmp_sources = keys %{$cmp_catalogue};

my @common_sources;

# Check for sources added or subtracted.
for (my $i = 0; $i <= $#ref_sources; $i++) {
    if (!exists $cmp_catalogue->{$ref_sources[$i]}) {
	print "Source ".$ref_sources[$i]." deleted from comparison catalogue.\n";
    } else {
	push @common_sources, $ref_sources[$i];
    }
}

for (my $i = 0; $i <= $#cmp_sources; $i++) {
    if (!exists $ref_catalogue->{$cmp_sources[$i]}) {
	print "Source ".$cmp_sources[$i]." added to comparison catalogue.\n";
    }
}

for (my $i = 0; $i <= $#common_sources; $i++) {
    my $ref_epochs = $ref_catalogue->{$common_sources[$i]}->{'epochs'};
    my $cmp_epochs = $cmp_catalogue->{$common_sources[$i]}->{'epochs'};

    my @common_epochs;
    my $name_printed = 0;
    for (my $j = 0; $j <= $#{$ref_epochs}; $j++) {
	my $epfound = 0;
	for (my $k = 0; $k <= $#{$cmp_epochs}; $k++) {
	    if ($ref_epochs->[$j] eq $cmp_epochs->[$k]) {
		push @common_epochs, { 'epoch' => $ref_epochs->[$j],
				       'ref_idx' => $j, 'cmp_idx' => $k };
		$epfound = 1;
		last;
	    }
	}
	if ($epfound == 0) {
	    $name_printed = &printname($common_sources[$i], $name_printed);
	    print "  epoch ".$ref_epochs->[$j]." deleted from comparison catalogue.\n";
	}
    }

    for (my $j = 0; $j <= $#{$cmp_epochs}; $j++) {
	my $epfound = 0;
	for (my $k = 0; $k <= $#{$ref_epochs}; $k++) {
	    if ($cmp_epochs->[$j] eq $ref_epochs->[$k]) {
		$epfound = 1;
		last;
	    }
	}
	if ($epfound == 0) {
	    $name_printed = &printname($common_sources[$i], $name_printed);
	    print "  epoch ".$cmp_epochs->[$j]." added to comparison catalogue.\n";
	}
    }

    for (my $j = 0; $j <= $#common_epochs; $j++) {
	my $ref_close = $ref_catalogue->{$common_sources[$i]}->{'fluxDensityFit'}->[$common_epochs[$j]->{'ref_idx'}]->{'closest5.5'};
	my $cmp_close = $cmp_catalogue->{$common_sources[$i]}->{'fluxDensityFit'}->[$common_epochs[$j]->{'cmp_idx'}]->{'closest5.5'};
	if ($ref_close->[1] != $cmp_close->[1]) {
	    $name_printed = &printname($common_sources[$i], $name_printed);
	    print "  flux density in epoch ".$common_epochs[$j]->{'epoch'}." changed from ".
		$ref_close->[1]." Jy at ".$ref_close->[0]." GHz to ".$cmp_close->[1]." Jy at ".
		$cmp_close->[0]." GHz.\n";
	}
    }
}


sub printname {
    my $sname = shift;
    my $np = shift;

    if ($np == 0) {
	print "Source $sname:\n";
	$np = 1;
    }

    return $np;
}
   
